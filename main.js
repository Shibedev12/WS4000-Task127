const { app, BrowserWindow } = require('electron');
const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const chokidar = require('chokidar');

let mainWindow;
let server;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 480,
    resizable: false,
    autoHideMenuBar: true,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.loadURL('http://localhost:3000');

  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(1);
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F11' && input.type === 'keyDown') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    if (input.key === 'Escape' && input.type === 'keyDown' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    }
    if (input.key === 'd' && input.type === 'keyDown' && input.control && input.alt) {
      mainWindow.setFullScreen(false);
      mainWindow.webContents.openDevTools();
    }
  });
}

function startDevServer() {
  const expressApp = express();
  const port = 3000;

  console.log('Starting Task127 WeatherSTAR 4000');

  const tempDir = path.join(__dirname, 'temp');
  if (fs.existsSync(tempDir)) {
    try {
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith('radar_'));
      files.forEach(file => {
        fs.unlinkSync(path.join(tempDir, file));
      });
      console.log(`Startup cleanup: removed ${files.length} old radar files`);
    } catch (error) {
      console.warn('Startup cleanup failed:', error.message);
    }
  }

  expressApp.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
  });

  let sseClients = [];

  expressApp.use(express.static(__dirname));

  expressApp.get('/live-reload', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    sseClients.push(res);
    res.write('data: connected\n\n');

    req.on('close', () => {
      sseClients = sseClients.filter(client => client !== res);
    });
  });

  const watcher = chokidar.watch([
    '*.html', '*.css', '*.js', '*.json'
  ], {
    ignored: /node_modules/,
    ignoreInitial: true
  });

  watcher.on('change', (filePath) => {
    console.log(`File changed: ${filePath} - triggering reload`);
    
    sseClients.forEach(client => {
      try {
        client.write(`data: reload\n\n`);
      } catch (err) {
        sseClients = sseClients.filter(c => c !== client);
      }
    });
  });

  expressApp.get('/api/config', (req, res) => {
    try {
      const configData = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
      res.json(JSON.parse(configData));
    } catch (error) {
      console.error('Config read error:', error.message);
      res.status(500).json({ error: 'Could not read config file' });
    }
  });

  expressApp.get('/api/radar/download', async (req, res) => {
    try {
      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `radar_${timestamp}.png`;
      const filePath = path.join(tempDir, filename);

      const compositeUrls = [
        'http://apollo.us.com:8008/radar_composite.png',
        'https://stratospheregroup.me/final.png'
      ];

      for (let i = 0; i < compositeUrls.length; i++) {
        const url = compositeUrls[i];
        console.log(`Attempting composite radar source ${i + 1}: ${url}`);
        
        try {
          const success = await downloadImage(url, filePath);
          if (success) {
            console.log('Composite radar downloaded successfully');
            return res.json({
              success: true,
              imagePath: `/temp/${filename}`,
              timestamp: timestamp,
              source: 'composite',
              fileSize: fs.statSync(filePath).size
            });
          }
        } catch (error) {
          console.error(`Composite source ${i + 1} failed:`, error.message);
        }
      }

      console.log('Falling back to NOAA radar method');
      
      let cfg = {};
      try {
        const configData = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
        cfg = JSON.parse(configData);
      } catch (error) {
        console.warn('Config load failed for radar dimensions:', error.message);
      }
      
      const WIDTH = Number.isFinite(Number(cfg.radar_map_width)) ? Number(cfg.radar_map_width) : 7066;
      const HEIGHT = Number.isFinite(Number(cfg.radar_map_height)) ? Number(cfg.radar_map_height) : 4248;
      
      const radarUrl = `https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap&FORMAT=image%2Fpng&TRANSPARENT=true&TILED=false&LAYERS=conus_bref_qcd&WIDTH=${WIDTH}&HEIGHT=${HEIGHT}&SRS=EPSG%3A4326&BBOX=-127.680%2C21.649%2C-66.507%2C50.434`;

      console.log('Downloading NOAA radar data');

      const file = fs.createWriteStream(filePath);
      const request = https.get(radarUrl, (response) => {
        if (response.statusCode !== 200) {
          console.error('NOAA radar download failed:', response.statusCode, response.statusMessage);
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          return res.status(500).json({ 
            success: false, 
            error: `HTTP ${response.statusCode}: ${response.statusMessage}` 
          });
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          console.log('NOAA radar data downloaded successfully');
          cleanupOldRadarFiles(tempDir);

          res.json({
            success: true,
            imagePath: `/temp/${filename}`,
            timestamp: timestamp,
            source: 'noaa',
            fileSize: fs.statSync(filePath).size
          });
        });

        file.on('error', (error) => {
          console.error('File write error:', error.message);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          res.status(500).json({ success: false, error: error.message });
        });
      });

      request.on('error', (error) => {
        console.error('NOAA radar request error:', error.message);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        res.status(500).json({ success: false, error: error.message });
      });

      request.setTimeout(30000, () => {
        console.error('NOAA radar download timeout');
        request.destroy();
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        res.status(500).json({ success: false, error: 'Download timeout' });
      });

    } catch (error) {
      console.error('Radar download endpoint error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  function downloadImage(url, filePath) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https:') ? https : http;
      const file = fs.createWriteStream(filePath);
      
      const request = protocol.get(url, (response) => {
        if (response.statusCode !== 200) {
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(true);
        });

        file.on('error', (error) => {
          file.close();
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
          reject(error);
        });
      });

      request.on('error', (error) => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(error);
      });

      request.setTimeout(15000, () => {
        request.destroy();
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        reject(new Error('Download timeout'));
      });
    });
  }

  function cleanupOldRadarFiles(tempDir) {
    try {
      const files = fs.readdirSync(tempDir)
        .filter(f => f.startsWith('radar_'))
        .map(f => ({
          name: f,
          path: path.join(tempDir, f),
          timestamp: parseInt(f.split('_')[1].split('.')[0])
        }))
        .sort((a, b) => b.timestamp - a.timestamp);

      if (files.length > 5) {
        files.slice(5).forEach(file => {
          fs.unlinkSync(file.path);
          console.log('Radar Image', file.name, ' has expired, so it has been deleted.');
        });
      }
    } catch (cleanupError) {
      console.warn('Houston, we have a problem. ', cleanupError.message);
    }
  }

  expressApp.use('/temp', express.static(path.join(__dirname, 'temp')));

  expressApp.post('/api/save-config', express.json(), async (req, res) => {
    try {
      const newConfig = req.body;
      fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(newConfig, null, 2));
      res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
      console.error('Config save error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Modern mode Mapbox basemap endpoint
  expressApp.get('/api/radar/mapbox-basemap', async (req, res) => {
    try {
      const { lat, lon, zoom = 10 } = req.query;
      
      if (!lat || !lon) {
        return res.status(400).json({ success: false, error: 'Latitude and longitude are required' });
      }

      let cfg = {};
      try {
        const configData = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
        cfg = JSON.parse(configData);
      } catch (error) {
        console.warn('Config load failed for Mapbox token:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to load Mapbox configuration' });
      }

      const mapboxToken = cfg.api?.mapbox;
      if (!mapboxToken) {
        return res.status(500).json({ success: false, error: 'Mapbox API token not configured' });
      }

      const tempDir = path.join(__dirname, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const filename = `mapbox_basemap_${timestamp}.png`;
      const filePath = path.join(tempDir, filename);

      // Mapbox static image URL with the user coordinates
      const mapboxUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v9/static/${lon},${lat},${zoom},0,0/1280x1280?access_token=${mapboxToken}`;
      
      console.log('Downloading Mapbox basemap:', mapboxUrl);

      const success = await downloadImage(mapboxUrl, filePath);
      if (success) {
        console.log('Mapbox basemap downloaded successfully');
        res.json({
          success: true,
          imagePath: `/temp/${filename}`,
          timestamp: timestamp,
          source: 'mapbox',
          fileSize: fs.statSync(filePath).size
        });
      } else {
        res.status(500).json({ success: false, error: 'Failed to download Mapbox basemap' });
      }

    } catch (error) {
      console.error('Mapbox basemap endpoint error:', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  server = expressApp.listen(port, () => {
    console.log(`Dev server running at http://localhost:${port}`);
  });
}

app.whenReady().then(() => {
  startDevServer();
  setTimeout(createWindow, 1000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});