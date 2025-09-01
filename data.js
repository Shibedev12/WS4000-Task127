/*
| Task127 data.js
| handles the data for the slides. 
| by hexadec1mal.
| rewrite done by me, dan13l
*/
class WeatherData {
    constructor() {
        this.stationCode = 'KHRO';
        this.currentData = null;
        this.extendedForecast = null;
        this.rawPeriods = null;
        this.lastUpdate = null;
        this.airportsIndex = null;
        
        this.iconMapping = {
            'clear': 'Clear.gif',
            'sunny': 'Sunny.gif',
            'partly-cloudy': 'Partly-Cloudy.gif',
            'mostly-cloudy': 'Mostly-Cloudy.gif',
            'cloudy': 'Cloudy.gif',
            'overcast': 'Cloudy.gif',
            'rain': 'Rain.gif',
            'light-rain': 'Rain.gif',
            'heavy-rain': 'Rain.gif',
            'showers': 'Shower.gif',
            'thunderstorm': 'Thunderstorm.gif',
            'thunder': 'Thunder.gif',
            'snow': 'Light-Snow.gif',
            'heavy-snow': 'Heavy-Snow.gif',
            'sleet': 'Sleet.gif',
            'freezing-rain': 'Freezing-Rain.gif',
            'wintry-mix': 'Wintry-Mix.gif',
            'fog': 'Cloudy.gif',
            'haze': 'Partly-Cloudy.gif',
            'default': 'Mostly-Cloudy.gif'
        };
    }

    async fetchCurrentConditions() {
        try {
            console.log(`Fetching weather data for ${this.stationCode}`);
            
            const response = await fetch(`https://api.weather.gov/stations/${this.stationCode}/observations/latest`);
            
            if (!response.ok) {
                throw new Error(`Weather API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (!this.airportsIndex) {
                try { 
                    await this.loadAirportsIndex(); 
                } catch (error) {
                    console.warn('Failed to load airports index:', error.message);
                }
            }
            
            this.currentData = this.parseWeatherData(data);
            this.lastUpdate = new Date();
            
            console.log('Weather data loaded successfully');
            
            try {
                window.dispatchEvent(new CustomEvent('weather-update', { detail: this.currentData }));
            } catch (error) {
                console.warn('Weather update event dispatch failed:', error.message);
            }
            
            return this.currentData;
            
        } catch (error) {
            console.error('Failed to fetch weather data:', error.message);
            
            if (!this.airportsIndex) {
                try { 
                    await this.loadAirportsIndex(); 
                } catch (indexError) {
                    console.warn('Failed to load airports index for fallback:', indexError.message);
                }
            }
            
            this.currentData = this.getMockData();
            
            try {
                window.dispatchEvent(new CustomEvent('weather-update', { detail: this.currentData }));
            } catch (eventError) {
                console.warn('Weather update event dispatch failed (mock data):', eventError.message);
            }
            
            return this.currentData;
        }
    }

    parseWeatherData(apiData) {
        const props = apiData.properties;
        const stationInfo = this.getStationInfo(this.stationCode);
        const locationName = stationInfo?.municipality || 'Unknown';
        const lat = stationInfo?.latitude_deg ? parseFloat(stationInfo.latitude_deg) : null;
        const lon = stationInfo?.longitude_deg ? parseFloat(stationInfo.longitude_deg) : null;
        
        return {
            station: this.stationCode,
            location: locationName,
            latitude: lat,
            longitude: lon,
            temperature: this.convertCelsiusToFahrenheit(props.temperature?.value),
            dewpoint: this.convertCelsiusToFahrenheit(props.dewpoint?.value),
            windChill: this.convertCelsiusToFahrenheit(props.windChill?.value),
            condition: this.parseCondition(props.textDescription),
            icon: this.getWeatherIcon(this.parseCondition(props.textDescription)),
            humidity: props.relativeHumidity?.value ? Math.round(props.relativeHumidity.value) : null,
            pressure: this.convertPascalsToInches(props.barometricPressure?.value),
            visibility: this.convertMetersToMiles(props.visibility?.value),
            ceiling: this.parseCeiling(props.cloudLayers),
            windDirection: this.parseWindDirection(props.windDirection?.value),
            windSpeed: this.convertMpsToMph(props.windSpeed?.value),
            windGust: this.convertMpsToMph(props.windGust?.value),
            observationTime: new Date(props.timestamp),
            rawData: props
        };
    }

    convertCelsiusToFahrenheit(celsius) {
        if (celsius === null || celsius === undefined) return null;
        return Math.round((celsius * 9/5) + 32);
    }

    convertPascalsToInches(pascals) {
        if (pascals === null || pascals === undefined) return null;
        return (pascals * 0.0002953).toFixed(2);
    }

    convertMetersToMiles(meters) {
        if (meters === null || meters === undefined) return null;
        const miles = meters * 0.000621371;
        return miles >= 10 ? Math.round(miles) : miles.toFixed(1);
    }

    convertMpsToMph(mps) {
        if (mps === null || mps === undefined) return null;
        return Math.round(mps * 2.237);
    }

    parseWindDirection(degrees) {
        if (degrees === null || degrees === undefined) return 'CALM';
        
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    }

    parseCondition(description) {
        if (!description) return 'Unknown';
        
        let condition = description
            .replace(/\s+/g, ' ')
            .trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        const currentHour = new Date().getHours();
        const isDaytime = currentHour >= 6 && currentHour < 18;
        
        if (condition.toLowerCase() === 'clear' && isDaytime) {
            condition = 'Sunny';
        }
        
        return condition;
    }

    getWeatherIcon(description) {
        if (!description) return this.iconMapping.default;
        
        const desc = description.toLowerCase();
        const now = new Date();
        const hour = now.getHours();
        const isNight = hour < 6 || hour >= 18;
        
        if (desc.includes('clear')) {
            return this.iconMapping.clear;
        } else if (desc.includes('sunny')) {
            return isNight ? 'Clear.gif' : this.iconMapping.sunny;
        } else if (desc.includes('partly cloudy') || desc.includes('partly')) {
            return this.iconMapping['partly-cloudy'];
        } else if (desc.includes('mostly cloudy') || desc.includes('mostly')) {
            return isNight ? 'Mostly-Clear.gif' : this.iconMapping['mostly-cloudy'];
        } else if (desc.includes('cloudy') || desc.includes('overcast')) {
            return this.iconMapping.cloudy;
        } else if (desc.includes('thunderstorm') || desc.includes('thunder')) {
            return this.iconMapping.thunderstorm;
        } else if (desc.includes('rain')) {
            return this.iconMapping.rain;
        } else if (desc.includes('shower')) {
            return this.iconMapping.showers;
        } else if (desc.includes('snow')) {
            return this.iconMapping.snow;
        } else if (desc.includes('sleet')) {
            return this.iconMapping.sleet;
        } else {
            return this.iconMapping.default;
        }
    }

    parseCeiling(cloudLayers) {
        if (!cloudLayers || cloudLayers.length === 0) return 'Unlimited';
        
        let lowestCeiling = Infinity;
        for (const layer of cloudLayers) {
            if (layer.amount === 'OVC' || layer.amount === 'BKN') {
                const heightMeters = layer.base?.value;
                if (heightMeters && heightMeters < lowestCeiling) {
                    lowestCeiling = heightMeters;
                }
            }
        }
        
        if (lowestCeiling === Infinity) return 'Unlimited';
        
        const feetAGL = Math.round(lowestCeiling * 3.28084);
        return `${feetAGL}`;
    }

    getMockData() {
        const stationInfo = this.getStationInfo(this.stationCode);
        const locationName = stationInfo?.municipality || 'Harrison';
        const lat = stationInfo?.latitude_deg ? parseFloat(stationInfo.latitude_deg) : null;
        const lon = stationInfo?.longitude_deg ? parseFloat(stationInfo.longitude_deg) : null;
        
        return {
            station: this.stationCode,
            location: locationName,
            latitude: lat,
            longitude: lon,
            temperature: 74,
            dewpoint: 43,
            windChill: 74,
            condition: 'Mostly Cloudy',
            icon: 'Mostly-Cloudy.gif',
            humidity: 32,
            pressure: '27.91',
            visibility: '10',
            ceiling: 'Unlimited',
            windDirection: 'NE',
            windSpeed: 12,
            windGust: null,
            observationTime: new Date(),
            rawData: { mock: true }
        };
    }

    updateCurrentConditionsDisplay(data = this.currentData) {
        if (!data) return;

        console.log('Updating current conditions display with live data');

        const locElement = document.querySelector('.current-location');
        if (locElement && data.location) {
            locElement.textContent = data.location;
        }

        const tempElement = document.querySelector('.current-temp');
        if (tempElement && data.temperature) {
            tempElement.textContent = `${data.temperature}°`;
        }

        const conditionElement = document.querySelector('.current-condition');
        if (conditionElement && data.condition) {
            conditionElement.innerHTML = this.formatConditionText(data.condition);
            conditionElement.classList.remove(...Array.from(conditionElement.classList).filter(cls => cls.startsWith('condition-')));
            const conditionClass = this.getConditionCSSClass(data.condition);
            conditionElement.classList.add(conditionClass);
            console.log(`Applied condition: "${data.condition}" with class: "${conditionClass}"`);
        }

        const iconElement = document.querySelector('.weather-icon');
        if (iconElement && data.icon) {
            iconElement.src = `./currentconditions+extendedforecast_icons/${data.icon}`;
            iconElement.alt = data.condition;
            iconElement.className = 'weather-icon ' + this.getIconClass(data.icon);
            console.log(`Applied icon class: ${this.getIconClass(data.icon)} for ${data.icon}`);
        }

        if (data.humidity) {
            const humidityElement = document.querySelector('.data-humidity');
            if (humidityElement) humidityElement.textContent = `${data.humidity}%`;
        }

        if (data.dewpoint) {
            const dewpointElement = document.querySelector('.data-dewpoint');
            if (dewpointElement) dewpointElement.textContent = `${data.dewpoint}°`;
        }

        if (data.ceiling) {
            const ceilingElement = document.querySelector('.data-ceiling');
            if (ceilingElement) ceilingElement.textContent = data.ceiling;
        }

        if (data.visibility) {
            const visibilityElement = document.querySelector('.data-visibility');
            if (visibilityElement) visibilityElement.textContent = `${Math.round(data.visibility)}mi.`;
        }

        if (data.pressure) {
            const pressureElement = document.querySelector('.data-pressure');
            if (pressureElement) pressureElement.textContent = data.pressure;
        }

        if (data.windChill) {
            const windChillElement = document.querySelector('.data-windchill');
            if (windChillElement) windChillElement.textContent = `${data.windChill}°`;
        }

        if (data.windDirection && data.windSpeed) {
            const windElement = document.querySelector('.current-wind');
            if (windElement) {
                windElement.textContent = `Wind: ${data.windDirection}  ${data.windSpeed}`;
            }
        }

        const gustElement = document.querySelector('.current-wind-line2');
        if (gustElement) {
            const hasGust = Number.isFinite(data.windGust) && data.windGust > 0;
            if (hasGust) {
                gustElement.style.display = 'block';
                gustElement.textContent = `Gusts to ${data.windGust}`;
            } else {
                gustElement.style.display = 'none';
            }
        }

        this.applyAuthenticColors(data);
        console.log('Current conditions display updated successfully');
    }

    getConditionCSSClass(condition) {
        if (!condition) return 'condition-unknown';
        
        const conditionLower = condition.toLowerCase();
        
        if (conditionLower.includes('clear')) {
            return 'condition-clear';
        } else if (conditionLower.includes('mostly cloudy')) {
            return 'condition-mostly-cloudy';
        } else if (conditionLower.includes('partly cloudy')) {
            return 'condition-partly-cloudy';
        } else if (conditionLower.includes('cloudy') || conditionLower.includes('overcast')) {
            return 'condition-cloudy';
        } else if (conditionLower.includes('sunny')) {
            return 'condition-sunny';
        } else if (conditionLower.includes('rain')) {
            return 'condition-rain';
        } else if (conditionLower.includes('shower')) {
            return 'condition-showers';
        } else if (conditionLower.includes('thunderstorm')) {
            return 'condition-thunderstorm';
        } else if (conditionLower.includes('snow')) {
            return 'condition-snow';
        } else if (conditionLower.includes('fog')) {
            return 'condition-fog';
        } else {
            return 'condition-unknown';
        }
    }

    formatConditionText(condition) {
        if (!condition) return 'Unknown';
        return condition;
    }
    
    applyAuthenticColors(data) {
        if (!data) return;

        try {
            console.log('Classic WeatherSTAR 4000 white text preserved - only location gets color');
        } catch (error) {
            console.error('Error applying authentic colors:', error.message);
        }
    }

    getIconClass(iconFilename) {
        if (!iconFilename) return 'null';
        
        const className = iconFilename
            .replace('.gif', '')
            .replace('.png', '')
            .toLowerCase()
            .replace(/-/g, '-');
            
        return className;
    }

    async init() {
        console.log('WeatherSTAR 4000 Data Module initializing');
        
        await this.loadStationFromConfig();
        
        try {
            await this.loadAirportsIndex();
        } catch (error) {
            console.warn('Could not preload airports index:', error.message);
        }
        
        // Fetch current conditions and update display immediately
        await this.fetchCurrentConditions();
        this.updateCurrentConditionsDisplay();
        
        // Prefetch extended forecast in background without blocking
        this.fetchExtendedForecast().catch(error => {
            console.warn('Forecast prefetch failed:', error.message);
        });
        
        setInterval(async () => {
            console.log('Refreshing weather data');
            await this.fetchCurrentConditions();
            this.updateCurrentConditionsDisplay();
        }, 5 * 60 * 1000);
        
        console.log('WeatherSTAR 4000 Data Module ready');
    }

    async fetchExtendedForecast() {
        try {
            if (!this.currentData) await this.fetchCurrentConditions();
            
            const lat = this.currentData?.latitude;
            const lon = this.currentData?.longitude;
            
            if (!(Number.isFinite(lat) && Number.isFinite(lon))) {
                throw new Error('Missing coordinates for forecast');
            }
            
            const ptResp = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
            if (!ptResp.ok) throw new Error(`Points lookup failed: ${ptResp.status}`);
            
            const pt = await ptResp.json();
            const fcUrl = pt?.properties?.forecast;
            if (!fcUrl) throw new Error('No forecast URL found');
            
            const fcResp = await fetch(fcUrl);
            if (!fcResp.ok) throw new Error(`Forecast fetch failed: ${fcResp.status}`);
            
            const fcData = await fcResp.json();
            const periods = fcData?.properties?.periods;
            if (!Array.isArray(periods) || periods.length < 3) throw new Error('Insufficient forecast data');
            
            this.rawPeriods = periods;
            this.extendedForecast = this.buildForecastDays(periods);
            
            try { 
                window.dispatchEvent(new CustomEvent('forecast-update', { detail: this.extendedForecast })); 
            } catch (error) {
                console.warn('Forecast update event dispatch failed:', error.message);
            }
            
            return this.extendedForecast;
            
        } catch (error) {
            console.warn('Extended forecast fetch failed, using mock data:', error.message);
            this.extendedForecast = this.getMockForecast();
            this.rawPeriods = this.getMockPeriods();
            
            try { 
                window.dispatchEvent(new CustomEvent('forecast-update', { detail: this.extendedForecast })); 
            } catch (eventError) {
                console.warn('Forecast update event dispatch failed (mock data):', eventError.message);
            }
            
            return this.extendedForecast;
        }
    }

    buildForecastDays(periods) {
        if (!Array.isArray(periods) || !periods.length) return this.getMockForecast();
        
        const dayPeriods = periods.filter(p => p.isDaytime === true);
        const pick = dayPeriods.slice(2, 5);
        
        const findNightLow = (startIso) => {
            const start = new Date(startIso);
            const night = periods.find(p => p.isDaytime === false && new Date(p.startTime) > start);
            return Number.isFinite(night?.temperature) ? night.temperature : null;
        };
        
        const dow = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
        const days = pick.map(p => {
            const d = new Date(p.startTime);
            const name = dow[d.getDay()];
            const hi = Number.isFinite(p.temperature) ? p.temperature : null;
            const lo = findNightLow(p.startTime);
            return {
                name,
                shortForecast: String(p.shortForecast || p.name || '').replace(/\s+/g,' ').trim(),
                hi,
                lo,
            };
        });
        
        if (days.length < 3) return this.getMockForecast();
        return days;
    }

    getMockForecast() {
        const dow = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
        const today = new Date();
        const mk = i => {
            const d = new Date(today.getTime() + (i+2)*24*3600*1000);
            return {
                name: dow[d.getDay()],
                shortForecast: ['Sunny','Partly Cloudy','Mostly Sunny'][i%3],
                hi: 70 + i*3,
                lo: 50 + i*2,
            };
        };
        return [mk(0), mk(1), mk(2)];
    }

    getMockPeriods() {
        const now = new Date();
        const periods = [];
        for (let i = 0; i < 14; i++) {
            const start = new Date(now.getTime() + i * 12 * 3600 * 1000);
            periods.push({
                number: i + 1,
                name: i % 2 === 0 ? 'Today' : 'Tonight',
                startTime: start.toISOString(),
                isDaytime: i % 2 === 0,
                temperature: 70 + Math.floor(i / 2) * 5,
                temperatureUnit: 'F',
                shortForecast: ['Sunny', 'Clear', 'Partly Cloudy', 'Mostly Sunny'][i % 4],
                detailedForecast: 'Mock forecast data'
            });
        }
        return periods;
    }

    async loadStationFromConfig() {
        try {
            const resp = await fetch('/api/config');
            if (!resp.ok) throw new Error(`Config fetch failed: ${resp.status}`);
            
            const cfg = await resp.json();
            const code = (cfg.locationcode || cfg.locationCode || cfg.station || '').toString().trim().toUpperCase();
            
            if (code) {
                this.stationCode = code;
                console.log(`Station from config: ${this.stationCode}`);
            } else {
                console.warn(`No locationcode in config; using default: ${this.stationCode}`);
            }
        } catch (error) {
            console.warn(`Failed to load station from config; using default: ${this.stationCode}`, error.message);
        }
    }

    async loadAirportsIndex() {
        if (this.airportsIndex) return this.airportsIndex;
        
        console.log('Loading airports index');
        const resp = await fetch('airports.csv');
        if (!resp.ok) throw new Error(`Airports CSV fetch failed: ${resp.status}`);
        
        const text = await resp.text();
        const rows = this.parseCSV(text);
        const headers = rows.shift();
        const idx = (name) => headers.indexOf(name);
        const identIdx = idx('ident');
        const muniIdx = idx('municipality');
        const latIdx = idx('latitude_deg');
        const lonIdx = idx('longitude_deg');
        const isoIdx = idx('iso_country');
        
        const map = new Map();
        for (const row of rows) {
            if (!row || !row.length) continue;
            const iso = row[isoIdx];
            if (iso !== 'US') continue;
            const ident = row[identIdx];
            if (!ident) continue;
            
            if (!map.has(ident)) {
                map.set(ident, {
                    municipality: row[muniIdx] || null,
                    latitude_deg: row[latIdx] || null,
                    longitude_deg: row[lonIdx] || null,
                });
            }
        }
        
        this.airportsIndex = map;
        console.log(`Airports index ready (${map.size} US identifiers)`);
        return this.airportsIndex;
    }

    getStationInfo(code) {
        if (!code || !this.airportsIndex) return null;
        return this.airportsIndex.get(code) || null;
    }

    parseCSV(text) {
        const rows = [];
        let row = [];
        let field = '';
        let inQuotes = false;
        
        for (let i = 0; i < text.length; i++) {
            const c = text[i];
            
            if (inQuotes) {
                if (c === '"') {
                    if (text[i + 1] === '"') {
                        field += '"';
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field += c;
                }
            } else {
                if (c === '"') {
                    inQuotes = true;
                } else if (c === ',') {
                    row.push(field);
                    field = '';
                } else if (c === '\n') {
                    row.push(field);
                    rows.push(row);
                    row = [];
                    field = '';
                } else if (c === '\r') {
                    // ignore
                } else {
                    field += c;
                }
            }
        }
        
        if (field.length > 0 || inQuotes || row.length > 0) {
            row.push(field);
            rows.push(row);
        }
        
        return rows;
    }
}

window.WeatherData = WeatherData;