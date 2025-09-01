/*
| Task127 Render.js
| This version is from the Private Beta!
| Render.js handles well, rendering. 
| Created by hexadec1mal.
| Task127 - Not as good as the taiganet sim, but better than nothing!
| modified to play nice by me dan13l
*/

class Renderer {
    constructor(config) {
        this.config = config;
        this.slowDraw = config.slow_draw === 'y';
        this.lastRadarTimestamp = 0;
        this.segmentTimeout = null;
        this.ldlLoopInterval = null;
        this.originalLayer1Src = null;
        this.currentSlide = null;
        this.bufferManager = new BufferManager(config);
        this.isInitialized = false;
        this.radarRefreshInterval = null;
        
        const cfgW = Number(config?.radar_map_width);
        const cfgH = Number(config?.radar_map_height);
        this.mapSpec = {
            width: Number.isFinite(cfgW) ? cfgW : 7066,
            height: Number.isFinite(cfgH) ? cfgH : 4248,
            lonMin: -127.680,
            latMin: 21.649,
            lonMax: -66.507,
            latMax: 50.434,
        };
        this.defaultRadarZoom = 4.2;
    }

    async init() {
        this.bufferManager.log('Renderer initializing...', 'info', 'RENDERER');

        // Preload radar data at startup (in background)
        this.preloadRadarData();

        // Hide all UI until current conditions data is loaded
        this.hideAllElements();

        // Wait for current conditions data before rendering the first slide
        this.bufferManager.log('Waiting for current conditions data...', 'info', 'RENDERER');
        try {
            await window.weatherData.fetchCurrentConditions();
            this.bufferManager.log('Current Conditions data ready', 'info', 'RENDERER');
        } catch (err) {
            this.bufferManager.log(`Error loading Current Conditions data: ${err.message}`, 'error', 'RENDERER');
        }

        // Perform startup sequence based on slow_draw setting
        if (this.slowDraw) {
            this.bufferManager.log('Starting slow draw startup sequence', 'info', 'RENDERER');
            this.performSlowStartup();
        } else {
            this.bufferManager.log('Starting fast startup sequence', 'info', 'RENDERER');
            this.performFastStartup();
        }
    }

    performFastStartup() {
        // Load graphical background and data first
        this.paintCurrentConditionsData();
        
        // Then teleport everything else in at once
        const commonElements = [
            '.header-bottom', '.twc-logo', '.header-text-shadow', '.header-text', 
            '.clock', '.ldl-image', '#ldl-text-span', '.header-line',
            '.centerbox-layer:not(.ef-layer)'
        ];
        
        commonElements.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
                el.style.display = 'block';
                el.style.opacity = '1';
                el.style.clipPath = 'none';
                el.style.transition = 'none'; // No animation
            });
        });

        // Apply modern mode if enabled  
        if (this.config.modern) {
            this.bufferManager.log('Applying modern mode...', 'info', 'RENDERER');
            document.body.classList.add('modern-mode');
            this.applyModernModeAssets();
        }
        
        // Remove initial clip mask so UI can render
        document.body.style.clipPath = 'none';
        const contentContainer = document.querySelector('.content-container');
        if (contentContainer) contentContainer.style.clipPath = 'none';
        
        // Start systems
        this.finishInitialization();
    }

    performSlowStartup() {
        // Animate everything in using standard animation style
        const sequence = [
            { element: document.body, delay: 0, duration: 3000, type: 'image' },
            { selector: '.clock', delay: 500, duration: 800, type: 'image' },
            { selector: '.ldl-image', delay: 1000, duration: 800, type: 'image' },
            { selector: '#ldl-text-span', delay: 1500, duration: 800, type: 'text' },
            { selector: '.header-bottom', delay: 2000, duration: 1000, type: 'image' },
            { element: document.querySelector('.content-container'), delay: 2500, duration: 2000, type: 'image' },
            { selector: '.twc-logo', delay: 3500, duration: 1000, type: 'image' },
            { selector: '.header-text-shadow', delay: 4500, duration: 800, type: 'text' },
            { selector: '.header-text', delay: 5000, duration: 800, type: 'text' },
            // Split centerbox layers into sequential entries
            { selector: '.centerbox-layer.layer-0', delay: 6000, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-1', delay: 6120, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-2', delay: 6240, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-3', delay: 6360, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-4', delay: 6480, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-5', delay: 6600, duration: 120, type: 'image' },
            { selector: '.centerbox-layer.layer-6', delay: 6720, duration: 120, type: 'image' }
        ];

        this.executePaintSequence(sequence, () => {
            this.paintCurrentConditionsData();
            this.finishInitialization();
        });
    }

    async preloadRadarData() {
        this.bufferManager.log('Preloading radar data...', 'info', 'RENDERER');
        try {
            await this.loadRadarData({ reveal: false });
            this.bufferManager.log('Radar data preloaded successfully', 'info', 'RENDERER');
        } catch (error) {
            this.bufferManager.log(`Failed to preload radar data: ${error.message}`, 'error', 'RENDERER');
        }
    }

    initializeWeatherSTAR() {
        // Legacy method - now handled by init()
        this.bufferManager.log('Legacy initializeWeatherSTAR called - redirecting to init()', 'info', 'RENDERER');
        this.init();
    }

    hideAllElements() {
        // Set initial clip paths for all elements
        const imageElements = document.querySelectorAll('img, .centerbox-layer, .radar-header, .radar-basemap, .radar-data');
        imageElements.forEach(el => {
            el.style.clipPath = 'inset(0 0 100% 0)';
            el.style.opacity = '1';
            el.style.display = 'none'; // Hidden until needed
        });

        const textElements = document.querySelectorAll('.header-text, .header-text-shadow, #ldl-text-span');
        textElements.forEach(el => {
            el.style.clipPath = 'inset(0 100% 0 0)';
            el.style.opacity = '1';
            el.style.display = 'none'; // Hidden until needed
        });

        // Hide Extended Forecast elements initially
        const efElements = document.querySelectorAll('#ef-overlay, .ef-icon, .centerbox-layer.ef-layer');
        efElements.forEach(el => {
            el.style.display = 'none';
            el.style.opacity = '0';
            // Reset clipPath for potential animation
            el.style.clipPath = 'inset(0 0 100% 0)';
        });

        document.body.style.clipPath = 'inset(0 0 100% 0)';
        document.querySelector('.content-container').style.clipPath = 'inset(0 0 100% 0)';
    }

    executePaintSequence(sequence, callback) {
        let completed = 0;
        const total = sequence.length;

        sequence.forEach((item, index) => {
            setTimeout(() => {
                let elements = [];
                
                if (item.element) {
                    elements = [item.element];
                } else if (item.selector) {
                    elements = Array.from(document.querySelectorAll(item.selector));
                }

                elements.forEach(element => {
                    element.style.display = 'block';
                    
                    if (item.type === 'text') {
                        this.simulateTypewriterEffect(element, item.duration);
                    } else {
                        this.simulateDialUpLoading(element, item.duration, item.element === document.body);
                    }
                });

                completed++;
                if (completed === total && callback) {
                    // After paint-in completes, invoke the callback
                    setTimeout(callback, Math.max(...sequence.map(s => s.delay + s.duration)) + 100);
                }
            }, item.delay);
        });
    }

    finishInitialization() {
        this.bufferManager.log('Paint-in sequence complete, starting systems...', 'info', 'RENDERER');
        
        // Apply modern mode if enabled (only if not already done in fast startup)
        if (this.config.modern && !document.body.classList.contains('modern-mode')) {
            this.bufferManager.log('Applying modern mode...', 'info', 'RENDERER');
            document.body.classList.add('modern-mode');
            this.applyModernModeAssets();
        }
        
        // Remove initial clip mask so UI can render (only if not already done)
        if (document.body.style.clipPath !== 'none') {
            document.body.style.clipPath = 'none';
        }
        const contentContainer = document.querySelector('.content-container');
        if (contentContainer && contentContainer.style.clipPath !== 'none') {
            contentContainer.style.clipPath = 'none';
        }
        
        // Paint current conditions data (only if not already done in fast startup)
        if (this.slowDraw) {
            this.paintCurrentConditionsData();
        }
        
        // Queue initial slide assets
        this.bufferManager.queueSlide('SLIDE_CC');
        
        // Start LDL and segment systems
        this.startLDLLoop();
        this.startSegmentSequence();
        
        this.isInitialized = true;
    }

    getLocalForecastDuration() {
        const periods = window.weatherData?.rawPeriods;
        if (!Array.isArray(periods) || periods.length < 3) return 12000;
        
        const firstThree = periods.slice(0, 3);
        const fullText = firstThree.map(p => {
            return `${p.name.toUpperCase()}...${p.detailedForecast || p.shortForecast}`;
        }).join(' ');
        
        const pages = this.splitTextIntoPages(fullText);
        return pages.length * 7000; // 7 seconds per page
    }

    paintCurrentConditionsData() {
        const ccElements = document.querySelectorAll(
            '.current-location, .current-temp, .current-condition, .weather-icon, ' +
            '.current-data-labels, .data-humidity, .data-dewpoint, .data-ceiling, ' +
            '.data-visibility, .data-pressure, .data-windchill, .current-wind, .current-wind-line2'
        );

        ccElements.forEach((element, index) => {
            if (element) {
                element.style.display = 'block';
                element.style.opacity = '1';
                element.style.clipPath = 'inset(0 0 100% 0)';
                
                setTimeout(() => {
                    this.simulateDialUpLoading(element, 200, false);
                }, index * 50);
            }
        });
    }

    simulateDialUpLoading(element, duration = 3000, isBackground = false) {
        let scanlineProgress = 0;
        const totalDuration = duration;
        const startTime = Date.now();
        
        const smoothScan = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / totalDuration, 1);
            
            let easedProgress;
            if (isBackground) {
                easedProgress = Math.pow(progress, 0.7);
            } else if (duration < 1000) {
                easedProgress = progress;
            } else {
                easedProgress = 1 - Math.pow(1 - progress, 2);
            }
            
            const revealPercentage = easedProgress * 100;
            const clipValue = Math.max(0, 100 - revealPercentage);
            
            element.style.clipPath = `inset(0 0 ${clipValue}% 0)`;
            
            if (progress < 1) {
                requestAnimationFrame(smoothScan);
            } else {
                element.style.clipPath = 'none';
                
                if (this.config.debug_mode === 'y') {
                    const type = isBackground ? 'background' : 'element';
                    console.log(`${type} ${element.className || element.tagName} fully scanned! (${duration}ms)`);
                }
            }
        };
        
        requestAnimationFrame(smoothScan);
    }

    simulateTypewriterEffect(element, duration = 800) {
        const originalText = element.textContent;
        
        element.style.clipPath = 'inset(0 100% 0 0)';
        element.style.opacity = '1';
        
        const totalDuration = duration;
        const startTime = Date.now();
        
        const wipeReveal = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / totalDuration, 1);
            
            const revealPercentage = progress * 100;
            const clipValue = Math.max(0, 100 - revealPercentage);
            
            element.style.clipPath = `inset(0 ${clipValue}% 0 0)`;
            
            if (progress < 1) {
                requestAnimationFrame(wipeReveal);
            } else {
                element.style.clipPath = 'none';
                
                if (this.config.debug_mode === 'y') {
                    console.log(`Text "${originalText}" fully wiped in! (${duration}ms)`);
                }
            }
        };
        
        requestAnimationFrame(wipeReveal);
    }

    animateCurrentConditionsText() {
        const tempElement = document.querySelector('.current-temp');
        const conditionElement = document.querySelector('.current-condition');
        const weatherIconElement = document.querySelector('.weather-icon');
        const dataLabelsElement = document.querySelector('.current-data-labels');
        const individualDataElements = document.querySelectorAll('.data-humidity, .data-dewpoint, .data-ceiling, .data-visibility, .data-pressure, .data-windchill');
        const windElements = document.querySelectorAll('.current-wind, .current-wind-line2');
        const locationElement = document.querySelector('.current-location');
        
        if (this.config.debug_mode === 'y') {
            console.log('PAINTING Current Conditions data - NO MERCY!');
        }
        
        const allElements = [locationElement, tempElement, conditionElement, weatherIconElement, dataLabelsElement, ...individualDataElements, ...windElements];
        
        allElements.forEach((element, index) => {
            if (element) {
                element.style.display = 'block';
                element.style.opacity = '1';
                element.style.clipPath = 'inset(0 0 100% 0)';
                
                setTimeout(() => {
                    this.simulateDialUpLoading(element, 200, false);
                }, index * 50);
            }
        });
    }

    startSegmentSequence() {
        if (!this.isInitialized) {
            this.bufferManager.log('Segment sequence delayed - waiting for initialization', 'info', 'RENDERER');
            setTimeout(() => this.startSegmentSequence(), 1000);
            return;
        }

        if (this.segmentTimeout) {
            clearTimeout(this.segmentTimeout);
            this.segmentTimeout = null;
        }
        
        this.bufferManager.log('Starting segment sequence (full product cycle)...', 'info', 'RENDERER');
        
        // Start with Current Conditions
        this.transitionToSlide('SLIDE_CC');
        this.startProductRotation();
    }

    startProductRotation() {
        if (this.segmentTimeout) {
            clearTimeout(this.segmentTimeout);
        }
        
        // Get flavor configuration from BufferManager
        const flavorConfig = this.bufferManager.flavorConfig;
        if (!flavorConfig) {
            this.bufferManager.log('No flavor config found, using default DE02', 'error', 'RENDERER');
            // Default fallback
            const products = [
                { slideId: 'SLIDE_CC', name: 'Current Conditions', duration: 10000 },
                { slideId: 'SLIDE_LOCAL', name: 'Local Forecast', duration: this.getLocalForecastDuration() },
                { slideId: 'SLIDE_EXTENDED', name: 'Extended Forecast', duration: 12000 },
                { slideId: 'SLIDE_RADAR', name: 'Radar', duration: 15000 }
            ];
            this.rotateProducts(products, 0);
            return;
        }
        
        // Build product list from flavor config
        const products = [];
        flavorConfig.slides.forEach(slideId => {
            switch(slideId) {
                case 'SLIDE_CC':
                    products.push({ slideId: 'SLIDE_CC', name: 'Current Conditions', duration: 10000 });
                    break;
                case 'SLIDE_LOCAL':
                    products.push({ slideId: 'SLIDE_LOCAL', name: 'Local Forecast', duration: this.getLocalForecastDuration() });
                    break;
                case 'SLIDE_EXTENDED':
                    products.push({ slideId: 'SLIDE_EXTENDED', name: 'Extended Forecast', duration: 12000 });
                    break;
                case 'SLIDE_RADAR':
                    products.push({ slideId: 'SLIDE_RADAR', name: 'Radar', duration: 15000 });
                    break;
            }
        });
        
        this.bufferManager.log(`Starting ${flavorConfig.name} rotation with ${products.length} products`, 'info', 'RENDERER');
        this.rotateProducts(products, 0);
    }
    
    rotateProducts(products, currentIndex) {
        const product = products[currentIndex];
        
        this.bufferManager.log(`Transitioning to: ${product.name}`, 'info', 'RENDERER');
        this.transitionToSlide(product.slideId);
        
        const nextProduct = () => {
            // Check if loop is disabled
            if (this.config.loop === 'n') {
                const nextIndex = currentIndex + 1;
                if (nextIndex >= products.length) {
                    // Completed flavor sequence and loop is disabled - go to gray screen
                    this.bufferManager.log('Flavor sequence complete, loop disabled - stopping rendering', 'info', 'RENDERER');
                    this.stopRendering();
                    return;
                }
                // Continue to next product in sequence
                this.rotateProducts(products, nextIndex);
            } else {
                // Loop enabled - continue rotation
                const nextIndex = (currentIndex + 1) % products.length;
                this.rotateProducts(products, nextIndex);
            }
        };
        
        this.segmentTimeout = setTimeout(nextProduct, product.duration);
    }
    
    stopRendering() {
        // Clear any active timeouts
        if (this.segmentTimeout) {
            clearTimeout(this.segmentTimeout);
            this.segmentTimeout = null;
        }
        
        if (this.ldlLoopInterval) {
            clearInterval(this.ldlLoopInterval);
            this.ldlLoopInterval = null;
        }
        
        if (this.radarRefreshInterval) {
            clearInterval(this.radarRefreshInterval);
            this.radarRefreshInterval = null;
        }
        
        // Hide all UI elements
        this.hideAllUIElements();
        
    // Set body to gray background and hide graphical background
    const content = document.querySelector('.content-container');
    if (content) content.style.display = 'none';
        document.body.style.clipPath = 'none';
        
        // Stop BufferManager heartbeat
        this.bufferManager.destroy();
        
        this.bufferManager.log('Rendering stopped - gray screen mode', 'info', 'RENDERER');
    }

    transitionToSlide(slideId) {
    // Clear all slide state classes before applying the new one
    document.body.classList.remove('slide-cc', 'slide-radar', 'slide-extended', 'slide-local');
        document.body.classList.add(
            slideId === 'SLIDE_CC' ? 'slide-cc' :
            slideId === 'SLIDE_RADAR' ? 'slide-radar' :
            slideId === 'SLIDE_LOCAL' ? 'slide-local' :
            slideId === 'SLIDE_EXTENDED' ? 'slide-extended' : ''
        );
        
        const previousSlide = this.currentSlide;
        
        // Get asset lists for comparison
        const previousAssets = previousSlide ? this.bufferManager.slideCompositions[previousSlide] || [] : [];
        const currentAssets = this.bufferManager.slideCompositions[slideId] || [];
        
        // Determine which assets are new/changed
        const assetsToHide = previousAssets.filter(assetId => !currentAssets.includes(assetId));
        const assetsToShow = currentAssets.filter(assetId => !previousAssets.includes(assetId));
        const persistentAssets = currentAssets.filter(assetId => previousAssets.includes(assetId));
        
        this.bufferManager.log(`Transition analysis: ${assetsToHide.length} to hide, ${assetsToShow.length} to show, ${persistentAssets.length} persistent`, 'info', 'RENDERER');

        // Handle special setup for each slide
        if (slideId === 'SLIDE_RADAR') {
            this.setupRadarSlide();
        } else if (slideId === 'SLIDE_EXTENDED') {
            this.setupExtendedForecastSlide();
        } else if (slideId === 'SLIDE_LOCAL') {
            this.setupLocalForecastSlide();
        } else if (slideId === 'SLIDE_CC') {
            this.setupCurrentConditionsSlide();
        }
        
        // Hide assets that are no longer needed
        assetsToHide.forEach(assetId => {
            this.bufferManager.hideAsset(assetId);
        });
        
        // Show new assets with smart animation
        this.showNewAssets(assetsToShow, slideId);
        
        // Handle header text changes (always consider this "new" content)
        this.handleHeaderTextChanges(slideId, previousSlide);
        
        this.currentSlide = slideId;
    }
    
    showNewAssets(assetsToShow, slideId) {
        // Group assets by type for proper animation ordering
        const headerAssets = assetsToShow.filter(id => id.includes('HEADER'));
        const boxLayerAssets = assetsToShow.filter(id => id.startsWith('ASSET_BOX_LAYER_'));
        const radarAssets = assetsToShow.filter(id => id.includes('RADAR'));
        const otherAssets = assetsToShow.filter(id => 
            !id.includes('HEADER') && 
            !id.startsWith('ASSET_BOX_LAYER_') && 
            !id.includes('RADAR')
        );
        
        // Show assets in proper order with appropriate animation
        let delay = 0;
        
        // 1. Headers first (if any)
        headerAssets.forEach(assetId => {
            setTimeout(() => {
                if (this.slowDraw) {
                    this.showAssetWithAnimation(assetId, 'text');
                } else {
                    this.bufferManager.showAsset(assetId);
                }
            }, delay);
            delay += this.slowDraw ? 200 : 0;
        });
        
        // 2. Other elements
        otherAssets.forEach(assetId => {
            setTimeout(() => {
                if (this.slowDraw) {
                    this.showAssetWithAnimation(assetId, 'image');
                } else {
                    this.bufferManager.showAsset(assetId);
                }
            }, delay);
            delay += this.slowDraw ? 100 : 0;
        });
        
        // 3. Box layers sequentially (if any)
        if (boxLayerAssets.length > 0) {
            setTimeout(() => {
                if (this.slowDraw) {
                    this.animateBoxLayersSequentially(boxLayerAssets);
                } else {
                    // Fast mode - show all at once
                    boxLayerAssets.forEach(assetId => {
                        this.bufferManager.showAsset(assetId);
                    });
                }
            }, delay);
        }
        
        // 4. Radar assets last (special handling for radar/header)
        radarAssets.forEach(assetId => {
            setTimeout(() => {
                // Radar assets never animate, always show immediately
                this.bufferManager.showAsset(assetId);
            }, delay);
        });
    }
    
    showAssetWithAnimation(assetId, type) {
        const asset = this.bufferManager.buffer.get(assetId);
        if (!asset && !this.bufferManager.queueAsset(assetId)) {
            return;
        }
        
        const element = asset ? asset.element : this.bufferManager.buffer.get(assetId)?.element;
        if (!element) return;
        
        const elements = Array.isArray(element) ? element : [element];
        
        elements.forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            
            if (type === 'text') {
                // Left-to-right clip animation for text
                el.style.clipPath = 'inset(0 100% 0 0)';
                el.style.transition = 'clip-path 400ms ease-out';
                
                requestAnimationFrame(() => {
                    el.style.clipPath = 'inset(0 0% 0 0)';
                });
            } else {
                // Top-to-bottom reveal for images
                el.style.clipPath = 'inset(0 0 100% 0)';
                el.style.transition = 'clip-path 300ms ease-out';
                
                requestAnimationFrame(() => {
                    el.style.clipPath = 'inset(0 0 0% 0)';
                });
            }
        });
    }
    
    animateBoxLayersSequentially(boxLayerAssets) {
        // Sort box layers in order (0, 1, 2, 3, 4, 5, 6)
        const sortedLayers = boxLayerAssets.sort((a, b) => {
            const layerA = parseInt(a.split('_').pop());
            const layerB = parseInt(b.split('_').pop());
            return layerA - layerB;
        });
        
        sortedLayers.forEach((assetId, index) => {
            setTimeout(() => {
                this.showAssetWithAnimation(assetId, 'image');
            }, index * 120); // 120ms delay between layers
        });
    }
    
    handleHeaderTextChanges(slideId, previousSlide) {
        // Add diagnostic logging
        this.bufferManager.log(`handleHeaderTextChanges: slideId=${slideId}, previousSlide=${previousSlide}`, 'info', 'RENDERER');
        
        // Only animate header text if it actually changed
        const headerChanged = this.isHeaderTextChanged(slideId, previousSlide);
        this.bufferManager.log(`Header changed: ${headerChanged}`, 'info', 'RENDERER');
        
        if (!headerChanged) return;

        this.bufferManager.log('Header text changed - animating new text', 'info', 'RENDERER');
        
        const headerTextElements = document.querySelectorAll('.header-text, .header-text-shadow');
        headerTextElements.forEach(el => {
            if (this.slowDraw) {
                el.style.display = 'block';
                el.style.opacity = '1';
                el.style.clipPath = 'inset(0 100% 0 0)';
                el.style.transition = 'clip-path 400ms ease-out';
                requestAnimationFrame(() => {
                    el.style.clipPath = 'inset(0 0% 0 0)';
                });
            } else {
                // Fast mode - no animation
                el.style.display = 'block';
                el.style.opacity = '1';
                el.style.clipPath = 'none';
                el.style.transition = 'none';
            }
        });
    }
    
    isHeaderTextChanged(slideId, previousSlide) {
        // Define header text content for each slide
        const headerContent = {
            'SLIDE_CC': ['Current', 'Conditions'],
            'SLIDE_LOCAL': ['Local Forecast'], 
            'SLIDE_EXTENDED': ['Extended', 'Forecast'], // Simplified for comparison
            'SLIDE_RADAR': ['', ''] // No text header
        };
        
        const currentHeader = headerContent[slideId] || ['', ''];
        const previousHeader = headerContent[previousSlide] || ['', ''];
        
        return currentHeader[0] !== previousHeader[0] || currentHeader[1] !== previousHeader[1];
    }

    // Hide both header-line wrappers to clear previous header content
    clearLocalForecastHeader() {
        const topWrapper = document.querySelector('.header-line-top');
        const bottomWrapper = document.querySelector('.header-line-bottom');
        if (topWrapper) topWrapper.style.display = 'none';
        if (bottomWrapper) bottomWrapper.style.display = 'none';
    }

    // Set the header title lines, passing empty string hides the line
    setHeaderTitle(line1, line2) {
        const topWrapper = document.querySelector('.header-line-top');
        const bottomWrapper = document.querySelector('.header-line-bottom');
        if (!topWrapper || !bottomWrapper) return;
        
        const topText = topWrapper.querySelector('.header-text.line1');
        const topShadow = topWrapper.querySelector('.header-text-shadow.line1');
        const bottomText = bottomWrapper.querySelector('.header-text.line2');
        const bottomShadow = bottomWrapper.querySelector('.header-text-shadow.line2');
        
        if (topText) topText.textContent = line1;
        if (topShadow) topShadow.textContent = line1;
        if (bottomText) bottomText.textContent = line2;
        if (bottomShadow) bottomShadow.textContent = line2;
        
        topWrapper.style.display = line1 ? 'block' : 'none';
        bottomWrapper.style.display = line2 ? 'block' : 'none';
    }

    // Centered single-line header (cset for centered)
    csetHeaderTitle(text) {
        // Clear any two-line header
        this.clearLocalForecastHeader();
        const topWrapper = document.querySelector('.header-line-top');
        if (!topWrapper) return;
        const topText = topWrapper.querySelector('.header-text.line1');
        const topShadow = topWrapper.querySelector('.header-text-shadow.line1');
        if (topText) topText.textContent = text;
        if (topShadow) topShadow.textContent = text;
        // Position centered between standard lines
        topWrapper.style.display = 'block';
        topWrapper.style.top = '38px';
        topWrapper.style.left = '50%';
        topWrapper.style.transform = 'translateX(-50%)';
    }

    setupCurrentConditionsSlide() {
        // Clear Local Forecast header if present
        this.clearLocalForecastHeader();
        
        // Hide any Extended Forecast visuals
        const efOverlay = document.getElementById('ef-overlay');
        if (efOverlay) efOverlay.style.display = 'none';
        document.querySelectorAll('.centerbox-layer.ef-layer, .ef-icon').forEach(el => {
            el.style.display = 'none';
        });

        // Hide Local Forecast text overlay
        const localTextOverlay = document.getElementById('local-forecast-text');
        if (localTextOverlay) localTextOverlay.style.display = 'none';

        // Show header-line wrapper divs
        document.querySelectorAll('.header-line').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });

        // Restore header
        this.setHeaderTitle('Current', 'Conditions');
        const topFill = document.querySelector('.header-line-top .header-text.line1');
        if (topFill) {
            topFill.classList.remove('white-text');
        }
        document.querySelectorAll('.header-line').forEach(el => el.classList.remove('header-condensed'));

        // Restore centerbox layer-1 if needed
        const layer1 = document.querySelector('.centerbox-layer.layer-1');
        if (layer1 && this.originalLayer1Src) {
            layer1.src = this.originalLayer1Src;
        }

    // Stop radar refresh
        this.stopRadarRefresh();
    // Prefetch radar data in background for next radar slide
    this.preloadRadarData();
        // Hide any Extended Forecast visuals before showing CC
        this.hideExtendedForecastElements();
        // Show header, logo, LDL, and text
        this.showCommonElements();
        // Show current conditions content
        this.showCurrentConditions();
        // Ensure header wrapper divs are visible
        document.querySelectorAll('.header-line-top, .header-line-bottom').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });

        // Show header image
        const headerImg = document.querySelector('.header-bottom');
        if (headerImg) {
            headerImg.style.display = 'block';
            headerImg.style.opacity = '1';
            headerImg.style.clipPath = 'none';
        }
        // Show header lines and text
        document.querySelectorAll('.header-line, .header-text, .header-text-shadow').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });
        // Show LDL
        document.querySelectorAll('.ldl-image, #ldl-text-span').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });
        // Show clock and date
        document.querySelectorAll('.clock').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });
        // Show centerbox layers (graphical)
        document.querySelectorAll('.centerbox-layer:not(.ef-layer)').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });

        // Restore graphical background container
        const contentBox = document.querySelector('.content-container');
        if (contentBox) {
            contentBox.style.display = 'block';
            contentBox.style.opacity = '1';
            contentBox.style.clipPath = 'none';
        }
    }

    setupRadarSlide() {
        // Clear Local Forecast header if present
        this.clearLocalForecastHeader();
    // Explicitly clear header text for radar so previous slide's header doesn't bleed through
    this.setHeaderTitle('', '');
        
        // Hide Local Forecast text overlay
        const localTextOverlay = document.getElementById('local-forecast-text');
        if (localTextOverlay) localTextOverlay.style.display = 'none';

        // Show basemap immediately and defer data overlay
        this.bufferManager.log('Radar slide: displaying basemap immediately', 'info', 'RENDERER');
        // Ensure basemap is shown
        this.bufferManager.showAsset('ASSET_RADAR_BASEMAP');
        // Hide previous data overlay
        this.bufferManager.hideAsset('ASSET_RADAR_DATA');
        // Start fetching radar data in background
        this.loadRadarData({ reveal: false }).then(() => {
            this.bufferManager.log('Radar data loaded, now revealing overlay', 'info', 'RENDERER');
            const now = Date.now();
            const radarImage = document.querySelector('.radar-data');
            if (radarImage && this.cachedRadarPath) {
                radarImage.src = this.cachedRadarPath + '?t=' + now;
            }
            this.bufferManager.showAsset('ASSET_RADAR_DATA');
        }).catch(err => {
            this.bufferManager.log(`Error loading radar overlay: ${err}`, 'error', 'RENDERER');
        });
        // Start periodic refresh
        this.startRadarRefresh();

        // Set radar header
        const radarHeader = document.querySelector('.radar-header');
        if (radarHeader) {
            radarHeader.src = '/header/radar_header.png';
        }

        // Center radar on location
        const data = window.weatherData?.currentData;
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            setTimeout(() => {
                this.centerRadarOn(data.latitude, data.longitude, { zoom: this.getRadarZoom() });
            }, 100);
        }
    }

    setupExtendedForecastSlide() {
        this.bufferManager.log('Setting up Extended Forecast slide', 'info', 'RENDERER');
        
        // Stop radar
        this.stopRadarRefresh();

        // Hide Local Forecast text overlay
        const localTextOverlay = document.getElementById('local-forecast-text');
        if (localTextOverlay) localTextOverlay.style.display = 'none';

        // Swap centerbox to Extended Forecast
        const layer1 = document.querySelector('.centerbox-layer.layer-1');
        if (layer1) {
            if (!this.originalLayer1Src) {
                this.originalLayer1Src = layer1.src;
            }
            layer1.src = './centerbox/extendedforecast.png';
        }

        // Set header text for Extended Forecast
        const data = window.weatherData?.currentData || {};
        const rawLoc = data.location || data.station || 'Local';
        const makePossessive = (name) => {
            try {
                const trimmed = String(name).trim();
                if (!trimmed) return "Local's";
                if (/['']s$/i.test(trimmed) || /['']$/i.test(trimmed)) return trimmed;
                if (/s$/i.test(trimmed)) return `${trimmed}'`;
                return `${trimmed}'s`;
            } catch { return "Local's"; }
        };
        const line1 = makePossessive(rawLoc);
        const line2 = 'Extended Forecast';
        
        this.bufferManager.log(`Setting EF header: "${line1}" / "${line2}"`, 'info', 'RENDERER');
        
        // Simple header title setting - no forced visibility
        this.setHeaderTitle(line1, line2);

        // Make location name white (line 1), Extended Forecast stays yellow (line 2)
        const topFill = document.querySelector('.header-line-top .header-text.line1');
        if (topFill) {
            topFill.classList.add('white-text');
        }

        // Render Extended Forecast overlay
        this.renderExtendedForecastOverlay();
    }

    setupLocalForecastSlide() {
        // Stop radar and hide extended forecast elements
        this.stopRadarRefresh();
        this.hideExtendedForecastElements();

    // Set header text for Local Forecast (single line)
    this.setHeaderTitle('Local Forecast', '');

        // Hide all current conditions content
        document.querySelectorAll(
            '.current-location, .current-temp, .current-condition, .weather-icon, ' +
            '.current-data-labels, .data-humidity, .data-dewpoint, .data-ceiling, ' +
            '.data-visibility, .data-pressure, .data-windchill, .current-wind, .current-wind-line2'
        ).forEach(el => {
            el.style.display = 'none';
        });

        // Show standard centerbox layers
        document.querySelectorAll('.centerbox-layer:not(.ef-layer)').forEach(el => {
            el.style.display = 'block';
            el.style.opacity = '1';
            el.style.clipPath = 'none';
        });

        // Ensure forecast data is loaded then start pages
        if (!window.weatherData?.rawPeriods) {
            window.weatherData.fetchExtendedForecast()
                .then(() => this.startLocalForecastPages())
                .catch(err => console.warn('Failed to fetch forecast for Local Forecast:', err));
        } else {
            this.startLocalForecastPages();
        }
    }

    getLDLLinesFromData(data) {
        const deg = '\u00B0F';
        const fmtNum = (n) => (n === null || n === undefined || Number.isNaN(n) ? '—' : String(n));
        const fmtFeet = (f) => {
            if (!f || f === 'Unlimited') return 'Unlimited';
            const num = parseInt(f, 10);
            return num.toLocaleString('en-US');
        };
        const loc = data?.location || data?.station || '';
        const ceiling = fmtFeet(data?.ceiling);
        const temp = fmtNum(data?.temperature);
        const windChill = fmtNum(data?.windChill ?? data?.temperature);
        const humidity = fmtNum(data?.humidity);
        const dew = fmtNum(data?.dewpoint);
        const pressure = data?.pressure ? String(data.pressure) : '—';
        const windDir = data?.windDirection || 'CALM';
        const windSpd = fmtNum(data?.windSpeed || 0);

        const ceilingLine = ceiling === 'Unlimited'
            ? 'Ceiling: Unlimited'
            : `Clear Below  ${ceiling} ft`;

        return [
            `Conditions at ${loc}`,
            ceilingLine,
            `Temp: ${temp}${deg}     Wind Chill: ${windChill}${deg}`,
            `Humidity:  ${humidity}%    Dewpoint: ${dew}${deg}`,
            `Barometric Pressure: ${pressure} in.`,
            `Wind: ${windDir}  ${windSpd} MPH`
        ];
    }

    startLDLLoop() {
        const span = document.getElementById('ldl-text-span');
        if (!span) return;
        let lines = this.getLDLLinesFromData(window.weatherData?.currentData);
        let idx = 0;

        const paintInFast = (el) => {
            this.simulateTypewriterEffect(el, 250);
        };
        const smashCutHide = (el) => {
            el.style.opacity = '1';
            el.style.transition = 'none';
            el.style.clipPath = 'inset(0 100% 0 0)';
        };

        const showNext = () => {
            span.textContent = lines[idx];
            paintInFast(span);
            idx = (idx + 1) % lines.length;
        };

        showNext();
        if (this.ldlLoopInterval) clearInterval(this.ldlLoopInterval);
        this.ldlLoopInterval = setInterval(() => {
            smashCutHide(span);
            showNext();
        }, 4000);

        window.addEventListener('weather-update', (ev) => {
            const data = ev.detail;
            lines = this.getLDLLinesFromData(data);
            idx = idx % lines.length;
        });
    }

    async transitionToRadar() {
        console.log('Transitioning to Radar view...');

        // Hide current conditions elements
        this.hideCurrentConditions();
        this.hideExtendedForecastElements();

        // Show common elements
        this.showCommonElements();

        // Show radar header
        const radarHeader = document.querySelector('.radar-header');
        if (radarHeader) {
            radarHeader.src = '/header/sunrise_radar.png';
            radarHeader.style.display = 'block';
            radarHeader.style.opacity = '1';
            radarHeader.style.clipPath = 'none';
        }

        // Load and show radar data
        await this.loadRadarData({ reveal: true });

        // Center radar on location
        const data = window.weatherData?.currentData;
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
            this.centerRadarOn(data.latitude, data.longitude, { zoom: this.getRadarZoom() });
        } else {
            this.centerRadarOn((this.mapSpec.latMin + this.mapSpec.latMax) / 2, (this.mapSpec.lonMin + this.mapSpec.lonMax) / 2, { zoom: 1.2 });
        }

        this.startRadarRefresh();
    }

    async transitionToExtendedForecast() {
        console.log('Transitioning to Extended Forecast...');

        // Stop radar and hide radar elements
        this.stopRadarRefresh();
        this.hideRadarElements();
        this.hideCurrentConditions();

        // Show common elements
        this.showCommonElements();

        // Swap centerbox to Extended Forecast
        const layer1 = document.querySelector('.centerbox-layer.layer-1');
        if (layer1) {
            if (!this.originalLayer1Src) {
                this.originalLayer1Src = layer1.src;
            }
            layer1.src = './centerbox/extendedforecast.png';
            layer1.style.display = 'block';
            layer1.style.opacity = '1';
            layer1.style.clipPath = 'none';
        }

        // Hide other centerbox layers
        const otherLayers = document.querySelectorAll('.centerbox-layer:not(.layer-1)');
        otherLayers.forEach(el => {
            el.style.display = 'none';
            el.style.opacity = '0';
        });

        // Set header text for Extended Forecast
        const data = window.weatherData?.currentData || {};
        const rawLoc = data.location || data.station || 'Local';
        const makePossessive = (name) => {
            try {
                const trimmed = String(name).trim();
                if (!trimmed) return "Local's";
                if (/['']s$/i.test(trimmed) || /['']$/i.test(trimmed)) return trimmed;
                if (/s$/i.test(trimmed)) return `${trimmed}'`;
                return `${trimmed}'s`;
            } catch { return "Local's"; }
        };
        const line1 = makePossessive(rawLoc);
    const line2 = 'Extended Forecast';
    // Set two-line header for Extended Forecast
    this.setHeaderTitle(line1, 'Extended Forecast');

        const topFill = document.querySelector('.header-line-top .header-text.line1');
        if (topFill) {
            topFill.classList.add('white-text');
        }

        document.querySelectorAll('.header-line').forEach(el => el.classList.add('header-condensed'));

        // Show Extended Forecast overlay
        this.renderExtendedForecastOverlay();
        const ef = document.getElementById('ef-overlay');
        if (ef) {
            ef.style.display = 'block';
            ef.style.opacity = '1';
        }
    }

    getRadarZoom() {
        const z = Number(this.config?.radar_zoom);
        if (Number.isFinite(z) && z >= 1.0 && z <= 10.0) return z;
        return this.defaultRadarZoom;
    }

    latLonToPixel(lat, lon) {
        const { width, height, lonMin, lonMax, latMin, latMax } = this.mapSpec;
        const clampedLon = Math.max(lonMin, Math.min(lonMax, lon));
        const clampedLat = Math.max(latMin, Math.min(latMax, lat));
        const x = ((clampedLon - lonMin) / (lonMax - lonMin)) * width;
        const y = ((latMax - clampedLat) / (latMax - latMin)) * height;
        return { x, y };
    }

    centerRadarOn(lat, lon, { zoom = 3.0 } = {}) {
        const { width: imgW, height: imgH } = this.mapSpec;
        const viewportW = 720;
        const viewportH = 480;
        const { x, y } = this.latLonToPixel(lat, lon);
        const baseScale = viewportW / imgW;
        const scale = baseScale * zoom;
        const cssW = imgW * scale;
        const cssH = imgH * scale;
        let left = -(x * scale - viewportW / 2);
        let top = -(y * scale - viewportH / 2);
        const minLeft = viewportW - cssW;
        const minTop = viewportH - cssH;
        left = Math.min(0, Math.max(minLeft, left));
        top = Math.min(0, Math.max(minTop, top));

        const basemap = document.querySelector('.radar-basemap');
        const overlay = document.querySelector('.radar-data');

        [basemap, overlay].forEach((img) => {
            if (!img) return;
            img.style.position = 'absolute';
            img.style.top = `${top}px`;
            img.style.left = `${left}px`;
            img.style.width = `${cssW}px`;
            img.style.height = 'auto';
            img.style.objectFit = 'fill';
        });
    }

    async loadRadarData(options = { reveal: true }) {
        try {
            const now = Date.now();
            
            // Check if we should use modern mode Mapbox basemap
            if (this.config.modern && window.weatherData?.latitude && window.weatherData?.longitude) {
                return await this.loadMapboxBasemap(options);
            }
            
            if (this.lastRadarTimestamp && now - this.lastRadarTimestamp < 15 * 60 * 1000) {
                console.log('Using cached radar image');
                if (this.cachedRadarPath && options.reveal) {
                    const radarMap = document.querySelector('.radar-basemap');
                    const radarImage = document.querySelector('.radar-data');
                    
                    if (radarMap) {
                        radarMap.style.display = 'block';
                        radarMap.style.opacity = '1';
                    }
                    if (radarImage) {
                        radarImage.src = this.cachedRadarPath + '?t=' + now;
                        radarImage.style.display = 'block';
                        radarImage.style.opacity = '1';
                    }
                }
                return;
            }
            
            console.log('Requesting radar data from server...');
            const response = await fetch('/api/radar/download');
            const result = await response.json();
            
            if (result.success) {
                console.log('Radar data ready:', result.imagePath);
                this.cachedRadarPath = result.imagePath;
                this.lastRadarTimestamp = now;
                
                if (options.reveal) {
                    const radarMap = document.querySelector('.radar-basemap');
                    const radarImage = document.querySelector('.radar-data');
                    
                    if (radarMap) {
                        radarMap.style.display = 'block';
                        radarMap.style.opacity = '1';
                    }
                    if (radarImage) {
                        radarImage.src = result.imagePath + '?t=' + now;
                        radarImage.style.display = 'block';
                        radarImage.style.opacity = '1';
                    }
                }
            } else {
                console.warn('Failed to load radar data:', result.error);
            }
        } catch (error) {
            console.error('Error loading radar data:', error);
        }
    }

    async loadMapboxBasemap(options = { reveal: true }) {
        try {
            const now = Date.now();
            
            // Check cache first (15 minute cache like normal radar)
            if (this.lastMapboxTimestamp && now - this.lastMapboxTimestamp < 15 * 60 * 1000) {
                console.log('Using cached Mapbox basemap');
                if (this.cachedMapboxPath && options.reveal) {
                    const radarMap = document.querySelector('.radar-basemap');
                    const radarImage = document.querySelector('.radar-data');
                    
                    if (radarMap) {
                        radarMap.src = this.cachedMapboxPath + '?t=' + now;
                        radarMap.style.display = 'block';
                        radarMap.style.opacity = '1';
                    }
                    // Hide the radar data layer in modern mode - just show the basemap
                    if (radarImage) {
                        radarImage.style.display = 'none';
                    }
                }
                return;
            }
            
            console.log('Requesting Mapbox basemap from server...');
            const lat = window.weatherData.latitude;
            const lon = window.weatherData.longitude;
            const zoom = 10; // Fixed zoom level for consistency
            
            const response = await fetch(`/api/radar/mapbox-basemap?lat=${lat}&lon=${lon}&zoom=${zoom}`);
            const result = await response.json();
            
            if (result.success) {
                console.log('Mapbox basemap ready:', result.imagePath);
                this.cachedMapboxPath = result.imagePath;
                this.lastMapboxTimestamp = now;
                
                if (options.reveal) {
                    const radarMap = document.querySelector('.radar-basemap');
                    const radarImage = document.querySelector('.radar-data');
                    
                    if (radarMap) {
                        radarMap.src = result.imagePath + '?t=' + now;
                        radarMap.style.display = 'block';
                        radarMap.style.opacity = '1';
                    }
                    // Hide the radar data layer in modern mode - just show the basemap
                    if (radarImage) {
                        radarImage.style.display = 'none';
                    }
                }
            } else {
                console.warn('Failed to load Mapbox basemap:', result.error);
                // Fall back to regular radar
                return await this.loadRegularRadar(options);
            }
        } catch (error) {
            console.error('Error loading Mapbox basemap:', error);
            // Fall back to regular radar
            return await this.loadRegularRadar(options);
        }
    }

    async loadRegularRadar(options = { reveal: true }) {
        // This is the original radar loading logic for fallback
        try {
            const now = Date.now();
            
            console.log('Requesting radar data from server...');
            const response = await fetch('/api/radar/download');
            const result = await response.json();
            
            if (result.success) {
                console.log('Radar data ready:', result.imagePath);
                this.cachedRadarPath = result.imagePath;
                this.lastRadarTimestamp = now;
                
                if (options.reveal) {
                    const radarMap = document.querySelector('.radar-basemap');
                    const radarImage = document.querySelector('.radar-data');
                    
                    if (radarMap) {
                        radarMap.style.display = 'block';
                        radarMap.style.opacity = '1';
                    }
                    if (radarImage) {
                        radarImage.src = result.imagePath + '?t=' + now;
                        radarImage.style.display = 'block';
                        radarImage.style.opacity = '1';
                    }
                }
            } else {
                console.warn('Failed to load radar data:', result.error);
            }
        } catch (error) {
            console.error('Error loading radar data:', error);
        }
    }

    startRadarRefresh() {
        if (this.radarRefreshInterval) {
            clearInterval(this.radarRefreshInterval);
        }
        
        this.radarRefreshInterval = setInterval(async () => {
            console.log('Refreshing radar data...');
            if (this.config.modern && window.weatherData?.latitude && window.weatherData?.longitude) {
                await this.loadMapboxBasemap();
            } else {
                await this.loadRadarData();
            }
        }, 15 * 60 * 1000);
    }

    stopRadarRefresh() {
        if (this.radarRefreshInterval) {
            clearInterval(this.radarRefreshInterval);
            this.radarRefreshInterval = null;
        }
    }

    transitionToCurrentConditions() {
        console.log('Transitioning back to Current Conditions...');
        
        // Stop radar and hide radar elements
        this.stopRadarRefresh();
        this.hideRadarElements();
        this.hideExtendedForecastElements();

        // Restore centerbox layer-1 to original
        const layer1 = document.querySelector('.centerbox-layer.layer-1');
        if (layer1 && this.originalLayer1Src) {
            layer1.src = this.originalLayer1Src;
        }

        // Restore header for Current Conditions
        this.setHeaderTitle('Current', 'Conditions');
        const topFill = document.querySelector('.header-line-top .header-text.line1');
        if (topFill) {
            topFill.classList.remove('white-text');
        }
        document.querySelectorAll('.header-line').forEach(el => el.classList.remove('header-condensed'));

        // Show current conditions
        this.showCurrentConditions();
    }

    hideCurrentConditions() {
        const elements = document.querySelectorAll(
            '.current-location, .current-temp, .current-condition, .weather-icon, .current-data-labels, .data-humidity, .data-dewpoint, .data-ceiling, .data-visibility, .data-pressure, .data-windchill, .current-wind, .current-wind-line2'
        );
        elements.forEach(element => {
            element.style.opacity = '0';
            element.style.display = 'none';
        });
    }

    showCurrentConditions() {
        console.log('Showing Current Conditions elements...');
        
        // Show common elements
        this.showCommonElements();
        
        // Show current conditions specific elements
        const ccElements = [
            '.twc-logo', '.centerbox-layer:not(.ef-layer)',
            '.current-location', '.current-temp', '.current-condition', '.weather-icon',
            '.current-data-labels', '.data-humidity', '.data-dewpoint', '.data-ceiling',
            '.data-visibility', '.data-pressure', '.data-windchill',
            '.current-wind', '.current-wind-line2'
        ];
        
        ccElements.forEach(sel => {
            const elems = document.querySelectorAll(sel);
            elems.forEach(el => {
                el.style.display = 'block';
                el.style.opacity = '1';
                el.style.clipPath = 'none';
            });
        });

        // Hide radar, EF, and Local Forecast elements
        this.hideRadarElements();
        this.hideExtendedForecastElements();
        const localTextOverlay = document.getElementById('local-forecast-text');
        if (localTextOverlay) localTextOverlay.style.display = 'none';
    }

    showCommonElements() {
        // Elements visible across all products
        const commonElements = [
            '.header-bottom', '.twc-logo', '.header-text-shadow', '.header-text', '.clock',
            '.centerbox-layer', '.radar-header', '.radar-basemap', '.radar-data', '.current-conditions-body',
            '.current-location', '.current-temp', '.current-condition', '.weather-icon',
            '.current-data', '.current-data-labels', '.current-data-values',
            '.data-humidity', '.data-dewpoint', '.data-ceiling', '.data-visibility',
            '.data-pressure', '.data-windchill', '.current-wind', '.current-wind-line2'
        ];
        
        commonElements.forEach(sel => {
            const elems = document.querySelectorAll(sel);
            elems.forEach(el => {
                el.style.display = 'block';
                el.style.opacity = '1';
                el.style.clipPath = 'none';
            });
        });

        // Ensure LDL text is visible
        const ldlSpan = document.getElementById('ldl-text-span');
        if (ldlSpan) {
            ldlSpan.style.display = 'inline-block';
            ldlSpan.style.opacity = '1';
        }
    }

    hideCurrentConditions() {
        const ccElements = [
            '.twc-logo', '.centerbox-layer',
            '.current-location', '.current-temp', '.current-condition', '.weather-icon',
            '.current-data-labels', '.data-humidity', '.data-dewpoint', '.data-ceiling',
            '.data-visibility', '.data-pressure', '.data-windchill',
            '.current-wind', '.current-wind-line2'
        ];
        
        ccElements.forEach(sel => {
            const elems = document.querySelectorAll(sel);
            elems.forEach(el => {
                el.style.display = 'none';
                el.style.opacity = '0';
            });
        });
    }

    hideRadarElements() {
        const radarElements = ['.radar-header', '.radar-basemap', '.radar-data'];
        radarElements.forEach(sel => {
            const elems = document.querySelectorAll(sel);
            elems.forEach(el => {
                el.style.display = 'none';
                el.style.opacity = '0';
            });
        });
    }

    hideExtendedForecastElements() {
        // Hide EF overlay
        const ef = document.getElementById('ef-overlay');
        if (ef) {
            ef.style.display = 'none';
            ef.style.opacity = '0';
        }
        // Hide EF-specific layer and icons
        const efExtras = document.querySelectorAll('.centerbox-layer.ef-layer, .ef-icon');
        efExtras.forEach(el => {
            el.style.display = 'none';
            el.style.opacity = '0';
        });
    }

    hideAllUIElements() {
        const allElements = [
            '.header-bottom', '.twc-logo', '.header-text-shadow', '.header-text', '.clock',
            '.centerbox-layer', '.radar-header', '.radar-basemap', '.radar-data', '.current-conditions-body',
            '.current-location', '.current-temp', '.current-condition', '.weather-icon',
            '.current-data', '.current-data-labels', '.current-data-values',
            '.data-humidity', '.data-dewpoint', '.data-ceiling', '.data-visibility',
            '.data-pressure', '.data-windchill', '.current-wind', '.current-wind-line2'
        ];
        
        allElements.forEach(sel => {
            const elems = document.querySelectorAll(sel);
            elems.forEach(element => {
                element.style.opacity = '0';
                element.style.display = 'none';
            });
        });
    }

    renderExtendedForecastOverlay() {
        const efData = window.weatherData?.extendedForecast;
        const ef = document.getElementById('ef-overlay');
        if (!ef) return;
        const cols = ef.querySelectorAll('.ef-col');
        if (!Array.isArray(efData) || efData.length < 3 || cols.length < 3) return;
        for (let i = 0; i < 3; i++) {
            const day = efData[i];
            const col = cols[i];
            const dow = col.querySelector('.ef-dow');
            const cond = col.querySelector('.ef-cond');
            const lo = col.querySelector('.ef-lo-val');
            const hi = col.querySelector('.ef-hi-val');
            const iconEl = col.querySelector('.ef-icon');
            if (dow) dow.textContent = day.name || '';
            if (cond) {
                let text = String(day.shortForecast || '').trim();
                text = text.replace(/^Chance\b/i, 'Scattered');
                text = text.replace(/Thunderstorms?|T-?storms?/ig, "T'Storms");
                if (/T'?Storms/i.test(text)) {
                    text = text
                        .replace(/\bShowers?\b/ig, '')
                        .replace(/\b(Rain\s+)?Showers?\b/ig, '')
                        .replace(/\b(and|&|with)\b/ig, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    const wordsAll = text.split(/\s+/);
                    const hasDescriptor = /(Scattered|Isolated|Numerous|Few|Slight|Strong|Severe|Likely)/i.test(text);
                    let firstWord = wordsAll.find(w => !/T'?Storms/i.test(w)) || '';
                    if (!hasDescriptor || !firstWord) firstWord = 'Scattered';
                    text = `${firstWord} T'Storms`;
                }
                text = text.replace(/\s{2,}/g, ' ');
                const words = text.split(/\s+/);
                if (words.length === 2) {
                    cond.innerHTML = `${words[0]}<br>${words[1]}`;
                } else if (words.length === 1) {
                    cond.innerHTML = `${text}<br>&nbsp;`;
                } else {
                    cond.textContent = text;
                }
            }
            if (lo) lo.textContent = (day.lo ?? '—');
            if (hi) hi.textContent = (day.hi ?? '—');
            if (iconEl) {
                try {
                    const iconFile = window.weatherData?.getWeatherIcon?.(day.shortForecast);
                    if (iconFile) {
                        iconEl.src = `./currentconditions+extendedforecast_icons/${iconFile}`;
                        iconEl.alt = day.shortForecast || '';
                    }
                } catch {}
            }
        }
        if (!this._efUpdateHooked) {
            window.addEventListener('forecast-update', () => this.renderExtendedForecastOverlay());
            this._efUpdateHooked = true;
        }
    }

    startLocalForecastPages() {
        const periods = window.weatherData?.rawPeriods;
        if (!Array.isArray(periods) || periods.length < 3) return;

        // Get first 3 periods and format as continuous text
        const firstThree = periods.slice(0, 3);
        const fullText = firstThree.map(p => {
            return `${p.name.toUpperCase()}...${p.detailedForecast || p.shortForecast}`;
        }).join(' ');

        // Log the full text for debugging
        this.bufferManager.log(`Local Forecast Full Text: ${fullText}`, 'info', 'RENDERER');

        // Split text into pages that fit in the centerbox
        const pages = this.splitTextIntoPages(fullText);
        
        // Log each page for debugging
        pages.forEach((page, index) => {
            this.bufferManager.log(`Local Forecast Page ${index + 1}: ${page}`, 'info', 'RENDERER');
        });
        
        // Start showing pages
        this.showLocalForecastPages(pages, 0);
    }

    splitTextIntoPages(text) {
        // Create a temporary element to measure actual text dimensions
        const tempElement = document.createElement('div');
        tempElement.style.cssText = `
            position: absolute;
            top: -9999px;
            left: -9999px;
            width: 565px;
            height: 325px;
            color: #d7d7d7;
            font-family: 'Star4000', monospace;
            font-size: 24pt;
            line-height: 1.2;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow: hidden;
            padding: 20px;
            box-sizing: border-box;
            visibility: hidden;
        `;
        document.body.appendChild(tempElement);

        const pages = [];
        let currentPage = '';
        const words = text.split(' ');
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testPage = currentPage ? `${currentPage} ${word}` : word;
            
            // Test if adding this word would overflow the container
            tempElement.textContent = testPage;
            
            if (tempElement.scrollHeight > tempElement.clientHeight && currentPage) {
                // Adding this word would overflow - finish current page and start new one
                pages.push(currentPage.trim());
                currentPage = word;
            } else {
                currentPage = testPage;
            }
        }
        
        // Add the last page if it has content
        if (currentPage.trim()) {
            pages.push(currentPage.trim());
        }
        
        // Clean up temporary element
        document.body.removeChild(tempElement);
        
        return pages;
    }

    showLocalForecastPages(pages, currentPageIndex) {
        if (currentPageIndex >= pages.length) {
            // All pages shown, transition to next slide
            this.bufferManager.log('Local Forecast pages complete', 'info', 'RENDERER');
            return;
        }

        const pageText = pages[currentPageIndex];
        this.bufferManager.log(`Displaying Local Forecast Page ${currentPageIndex + 1}/${pages.length}: "${pageText.substring(0, 100)}${pageText.length > 100 ? '...' : ''}"`, 'info', 'RENDERER');
        
        // Hide all current conditions elements first
        document.querySelectorAll('.current-location, .current-temp, .current-condition, .weather-icon, .current-data-labels, .data-humidity, .data-dewpoint, .data-ceiling, .data-visibility, .data-pressure, .data-windchill, .current-wind, .current-wind-line2').forEach(el => {
            el.style.display = 'none';
            el.style.opacity = '0';
        });
        
        // Create or get local forecast text overlay
        let localTextOverlay = document.getElementById('local-forecast-text');
        if (!localTextOverlay) {
            localTextOverlay = document.createElement('div');
            localTextOverlay.id = 'local-forecast-text';
            localTextOverlay.style.cssText = `
                position: absolute;
                top: 90px;
                left: 70px;
                width: 565px;
                height: 35  0px;
                color: #d7d7d7;
                font-family: 'Star4000', monospace;
                font-size: 24pt;
                line-height: 1.2;
                -webkit-text-stroke: 0.5px #000000;
                text-shadow: 2px 2px 1px #000;
                white-space: pre-wrap;
                word-wrap: break-word;
                overflow: hidden;
                z-index: 100;
                padding: 20px;
                box-sizing: border-box;
            `;
            document.querySelector('.content-container').appendChild(localTextOverlay);
        }

        // Set the page text with mixed case handling
        const displayText = this.config.mixed_case === false ? pageText.toUpperCase() : pageText;
        localTextOverlay.textContent = displayText;
        localTextOverlay.style.display = 'block';

        // Schedule next page after 7 seconds
        setTimeout(() => {
            this.showLocalForecastPages(pages, currentPageIndex + 1);
        }, 7000);
    }

    applyModernModeAssets() {
        // Swap main header background
        const headerImg = document.querySelector('.header-bottom');
        if (headerImg) {
            headerImg.src = './modern/modern_header.png';
        }

        // Swap LDL background 
        const ldlImg = document.querySelector('.ldl-image');
        if (ldlImg) {
            ldlImg.src = './modern/modern_ldl.png';
        }

        // Swap radar header background
        const radarHeaderImg = document.querySelector('.radar-header');
        if (radarHeaderImg) {
            radarHeaderImg.src = './modern/modern_radar.png';
        }

        // Swap extended forecast centerbox
        const efImg = document.querySelector('.ef-layer');
        if (efImg) {
            efImg.src = './modern/modern_extendedforecastbox.png';
        }

        // Swap TWC logo
        const logoImg = document.querySelector('.twc-logo');
        if (logoImg) {
            logoImg.src = './modern/modern_logo.png';
        }

        // Apply modern background via CSS
        const contentContainer = document.querySelector('.content-container');
        if (contentContainer) {
            contentContainer.style.background = "url('./modern/modern_graphical.png') center/cover no-repeat";
        }

        this.bufferManager.log('Modern mode assets applied', 'info', 'RENDERER');
    }
}

window.Renderer = Renderer;