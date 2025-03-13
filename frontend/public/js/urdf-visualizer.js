/**
 * URDF Visualizer
 * A class for visualizing URDF robot models using Three.js
 */

class URDFVisualizer {
    /**
     * Creates a new URDFVisualizer instance
     * @param {Object} options - Configuration options
     */
    constructor(options = {}) {
        const defaults = {
            containerId: 'webgl-container',
            debugConsoleId: 'debugConsole',
            modelSelectId: 'modelSelect',
            loadButtonId: 'loadButton',
            animateButtonId: 'animateButton',
            loadingStatusId: 'loadingStatus',
            meshStatusId: 'meshStatus',
            animationStatusId: 'animationStatus',
            treeStructureId: 'treeStructure',
            jointControlsId: 'jointControls',
            jointControlsContainerId: 'jointControlsContainer',
            colorSchemeSelectId: 'colorSchemeSelect',
            showJointLimits: true,
            jointStepSize: 2 // Default step size in degrees
        };
        
        this.options = { ...defaults, ...options };
        
        // Initialize components
        this.logger = new DebugLogger(this.options.debugConsoleId);
        this.urdfReader = new URDFReader();
        this.meshLoader = new MeshLoader(this.logger);
        this.jointAnimator = new JointAnimator(this.logger, this.urdfReader);
        
        // Color scheme options
        this.colorSchemes = [
            { name: "Vibrant", colors: [0x4285F4, 0xEA4335, 0xFBBC05, 0x34A853, 0x8F00FF, 0x00FFFF, 0xFF00FF] },
            { name: "Pastel", colors: [0xFFB3BA, 0xFFDFBA, 0xFFFDBA, 0xBAFFDA, 0xBAE1FF, 0xD0BAFF, 0xFFBAF9] },
            { name: "Blue to Red", colors: [0x0000FF, 0x4444FF, 0x8888FF, 0xCCCCFF, 0xFFCCCC, 0xFF8888, 0xFF4444, 0xFF0000] },
            { name: "Grayscale", colors: [0x111111, 0x333333, 0x555555, 0x777777, 0x999999, 0xBBBBBB, 0xDDDDDD] },
            { name: "Rainbow", colors: [0xFF0000, 0xFF7F00, 0xFFFF00, 0x00FF00, 0x0000FF, 0x4B0082, 0x9400D3] }
        ];
        this.currentColorScheme = 0; // Default to vibrant
        
        // Initialize Three.js objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.robotGroup = null;
        this.jointObjects = new Map();
        
        // Camera controls
        this.spherical = {
            radius: 10,
            phi: Math.PI / 4,
            theta: Math.PI / 4
        };
        
        this.isDragging = false;
        this.previousMousePosition = { x: 0, y: 0 };
        
        // Initialize the viewer
        this.init();
        this.setupEventListeners();
        this.setupColorSchemeSelector();
        this.loadAvailableModels();
        this.animate();
    }
    
    /**
     * Initializes the Three.js scene and renderer
     */
    init() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xf3f4f6);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.updateCameraPosition();
        
        // Renderer
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            this.logger.error(`Container element with ID '${this.options.containerId}' not found`);
            return;
        }
        
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        container.appendChild(this.renderer.domElement);
        
        // Add grid
        const grid = ThreeUtils.createGrid();
        this.scene.add(grid);
        
        // Add coordinate axes helper
        const axesHelper = new THREE.AxesHelper(5);
        this.scene.add(axesHelper);
        
        // Add lighting
        ThreeUtils.setupLighting(this.scene);
        
        // Robot group
        this.robotGroup = new THREE.Group();
        this.scene.add(this.robotGroup);
    }
    
    /**
     * Sets up event listeners for user interaction
     */
    setupEventListeners() {
        const container = document.getElementById(this.options.containerId);
        if (container) {
            container.addEventListener('mousedown', this.onMouseDown.bind(this));
            container.addEventListener('mousemove', this.onMouseMove.bind(this));
            container.addEventListener('mouseup', this.onMouseUp.bind(this));
            container.addEventListener('mouseleave', this.onMouseUp.bind(this));
            container.addEventListener('wheel', this.onMouseWheel.bind(this));
        }
        
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        // Add load button event listener
        const loadButton = document.getElementById(this.options.loadButtonId);
        if (loadButton) {
            loadButton.addEventListener('click', () => this.loadSelectedModel());
            this.logger.info('Load button event listener added');
        } else {
            this.logger.error(`Load button with ID '${this.options.loadButtonId}' not found`);
        }
        
        // Add animation button event listener
        const animateButton = document.getElementById(this.options.animateButtonId);
        if (animateButton) {
            animateButton.addEventListener('click', () => {
                if (this.jointAnimator.isAnimating) {
                    this.stopAnimation();
                } else {
                    this.startAnimation();
                }
            });
            this.logger.info('Animation button event listener added');
        } else {
            this.logger.error(`Animation button with ID '${this.options.animateButtonId}' not found`);
        }
    }
    
    /**
     * Sets up the color scheme selector
     */
    setupColorSchemeSelector() {
        const colorSchemeSelect = document.getElementById(this.options.colorSchemeSelectId);
        if (!colorSchemeSelect) {
            this.logger.warning(`Color scheme select with ID '${this.options.colorSchemeSelectId}' not found`);
            return;
        }
        
        // Clear existing options
        colorSchemeSelect.innerHTML = '';
        
        // Add options for each color scheme
        this.colorSchemes.forEach((scheme, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = scheme.name;
            colorSchemeSelect.appendChild(option);
        });
        
        // Set default value
        colorSchemeSelect.value = this.currentColorScheme;
        
        // Add event listener
        colorSchemeSelect.addEventListener('change', (event) => {
            this.currentColorScheme = parseInt(event.target.value);
            this.logger.info(`Changed color scheme to: ${this.colorSchemes[this.currentColorScheme].name}`);
            
            // If a robot is loaded, reload it to apply the new color scheme
            const modelSelect = document.getElementById(this.options.modelSelectId);
            if (modelSelect && modelSelect.value) {
                this.loadSelectedModel();
            }
        });
        
        this.logger.info('Color scheme selector initialized');
    }
    
    /**
     * Updates the camera position based on spherical coordinates
     */
    updateCameraPosition() {
        // Adjust camera position for Z-up coordinate system
        this.camera.position.x = this.spherical.radius * Math.sin(this.spherical.phi) * Math.cos(this.spherical.theta);
        this.camera.position.z = this.spherical.radius * Math.cos(this.spherical.phi); // Use Z for height
        this.camera.position.y = this.spherical.radius * Math.sin(this.spherical.phi) * Math.sin(this.spherical.theta);
        this.camera.up.set(0, 0, 1); // Set Z as up vector
        this.camera.lookAt(0, 0, 0);
    }
    
    /**
     * Handles mouse down events for camera rotation
     * @param {MouseEvent} event - The mouse event
     */
    onMouseDown(event) {
        this.isDragging = true;
        const rect = event.target.getBoundingClientRect();
        this.previousMousePosition = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }
    
    /**
     * Handles mouse move events for camera rotation
     * @param {MouseEvent} event - The mouse event
     */
    onMouseMove(event) {
        if (!this.isDragging) return;
        
        const rect = event.target.getBoundingClientRect();
        const currentPosition = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
        
        const deltaMove = {
            x: currentPosition.x - this.previousMousePosition.x,
            y: currentPosition.y - this.previousMousePosition.y
        };
        
        const rotationSpeed = 0.01;
        this.spherical.theta -= deltaMove.x * rotationSpeed;
        this.spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this.spherical.phi + deltaMove.y * rotationSpeed));
        
        this.updateCameraPosition();
        this.previousMousePosition = currentPosition;
    }
    
    /**
     * Handles mouse up events for camera rotation
     */
    onMouseUp() {
        this.isDragging = false;
    }
    
    /**
     * Handles mouse wheel events for camera zoom
     * @param {WheelEvent} event - The wheel event
     */
    onMouseWheel(event) {
        event.preventDefault();
        const zoomSpeed = 0.1;
        const minDistance = 2;
        const maxDistance = 20;
        const zoomDelta = event.deltaY * zoomSpeed;
        this.spherical.radius = Math.max(minDistance, Math.min(maxDistance, this.spherical.radius + zoomDelta));
        this.updateCameraPosition();
    }
    
    /**
     * Handles window resize events
     */
    onWindowResize() {
        const container = document.getElementById(this.options.containerId);
        if (container) {
            this.camera.aspect = container.clientWidth / container.clientHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(container.clientWidth, container.clientHeight);
        }
    }
    
    /**
     * Animation loop
     */
    animate() {
        requestAnimationFrame(this.animate.bind(this));
        
        // Update joint animation if active
        if (this.jointAnimator.isAnimating) {
            const animationState = this.jointAnimator.update(0.016); // Assuming 60fps
            
            if (animationState) {
                this.updateAnimationStatus(animationState);
            }
        }
        
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Starts the joint animation
     */
    startAnimation() {
        const success = this.jointAnimator.startAnimation((state) => {
            this.updateAnimationStatus(state);
        });
        
        if (success) {
            const animateButton = document.getElementById(this.options.animateButtonId);
            if (animateButton) {
                animateButton.style.background = '#f44336';
                animateButton.textContent = 'Stop Animation';
            }
        }
    }
    
    /**
     * Stops the joint animation
     */
    stopAnimation() {
        this.jointAnimator.stopAnimation();
        
        const animateButton = document.getElementById(this.options.animateButtonId);
        if (animateButton) {
            animateButton.style.background = '#2196F3';
            animateButton.textContent = 'Animate Joints';
        }
        
        const animationStatus = document.getElementById(this.options.animationStatusId);
        if (animationStatus) {
            animationStatus.textContent = '';
        }
    }
    
    /**
     * Updates the animation status display
     * @param {Object} state - The animation state
     */
    updateAnimationStatus(state) {
        const status = document.getElementById(this.options.animationStatusId);
        if (status && state.isAnimating) {
            status.textContent = `Animating joint: ${state.currentJoint}`;
        }
    }
    
    /**
     * Clears the robot from the scene
     */
    clearRobot() {
        while(this.robotGroup.children.length > 0) {
            this.robotGroup.remove(this.robotGroup.children[0]);
        }
    }
    
    /**
     * Loads available robot models from the server
     */
    async loadAvailableModels() {
        try {
            this.logger.info('Starting to load URDF models from server...');
            const timestamp = new Date().getTime();
            const url = `/api/models?t=${timestamp}`;
            this.logger.info(`Fetching models from: ${url}`);
            
            const response = await fetch(url);
            this.logger.info(`Server response status: ${response.status} ${response.statusText}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            this.logger.info(`Raw server response: ${text}`);
            
            if (!text) {
                throw new Error('Empty response from server');
            }
            
            const models = JSON.parse(text);
            this.logger.success(`Found ${models.length} URDF models on server`);
            
            const select = document.getElementById(this.options.modelSelectId);
            if (!select) {
                throw new Error(`Could not find modelSelect element with ID '${this.options.modelSelectId}' in DOM`);
            }
            
            select.innerHTML = '<option value="">Select a model...</option>';
            
            if (!Array.isArray(models) || models.length === 0) {
                this.logger.warning('No URDF models found on server');
                select.innerHTML = '<option value="">No models available</option>';
                return;
            }
            
            models.forEach(model => {
                if (!model.name || !model.urdf) {
                    this.logger.warning(`Invalid model data received: ${JSON.stringify(model)}`);
                    return;
                }
                const option = document.createElement('option');
                option.value = model.urdf;
                option.textContent = model.name;
                select.appendChild(option);
                this.logger.info(`Added model to dropdown: ${model.name}`);
            });
            
            this.logger.success(`Successfully populated dropdown with ${models.length} URDF models`);
        } catch (error) {
            this.logger.error(`Failed to load models from server: ${error.message}`);
            const select = document.getElementById(this.options.modelSelectId);
            if (select) {
                select.innerHTML = '<option value="">Error loading models</option>';
            }
        }
    }
    
    /**
     * Loads the selected robot model
     */
    async loadSelectedModel() {
        const modelSelect = document.getElementById(this.options.modelSelectId);
        const modelFile = modelSelect ? modelSelect.value : '';
        
        if (!modelFile) {
            this.logger.warning('No model selected in dropdown');
            alert('Please select a model first');
            return;
        }
        
        const loadingStatus = document.getElementById(this.options.loadingStatusId);
        const meshStatus = document.getElementById(this.options.meshStatusId);
        const loadButton = document.getElementById(this.options.loadButtonId);
        
        try {
            this.logger.info(`Starting to load URDF model: ${modelFile}`);
            if (loadingStatus) loadingStatus.textContent = 'Loading URDF...';
            if (loadButton) loadButton.disabled = true;
            if (meshStatus) meshStatus.textContent = '';
            
            // Clear existing robot
            this.clearRobot();
            
            // Load and parse the URDF
            this.logger.info('Requesting URDF file from server...');
            const robotData = await this.urdfReader.loadModelFromFile(modelFile);
            this.logger.success(`Successfully parsed URDF for robot: ${robotData.name}`);
            this.logger.info(`Robot has ${robotData.links.size} links and ${robotData.joints.size} joints`);
            
            // Display the tree structure
            this.logger.info('Generating robot tree structure...');
            const treeStructure = document.getElementById(this.options.treeStructureId);
            if (treeStructure) {
                treeStructure.textContent = this.urdfReader.displayTreeStructure();
            }
            this.logger.success('Robot tree structure generated');
            
            // Visualize the robot
            this.logger.info('Starting robot visualization...');
            await this.visualizeRobot(robotData);
            
            // Create joint control buttons
            this.createJointControls();
            
            if (loadingStatus) loadingStatus.textContent = 'Model loaded successfully';
            this.logger.success('Robot model fully loaded and visualized');
        } catch (error) {
            console.error('Error:', error);
            this.logger.error(`Failed to load model: ${error.message}`);
            this.logger.error('Stack trace: ' + error.stack);
            if (loadingStatus) loadingStatus.textContent = 'Error loading model: ' + error.message;
        } finally {
            if (loadButton) loadButton.disabled = false;
        }
    }
    
    /**
     * Generates a color based on the link's depth in the kinematic chain
     * @param {number} depth - The depth of the link in the kinematic chain
     * @returns {THREE.Color} - The color for the link
     */
    generateLinkColor(depth) {
        // Get the current color scheme
        const scheme = this.colorSchemes[this.currentColorScheme];
        const colors = scheme.colors;
        
        // Get color based on depth, cycling through the array
        const colorIndex = depth % colors.length;
        return new THREE.Color(colors[colorIndex]);
    }

    /**
     * Applies a color to all meshes in a group
     * @param {THREE.Group} group - The group containing meshes
     * @param {THREE.Color} color - The color to apply
     */
    applyColorToGroup(group, color) {
        group.traverse(child => {
            if (child.isMesh) {
                // Create a new material with the specified color
                if (child.material) {
                    // If it's an array of materials, update each one
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map(mat => {
                            const newMat = mat.clone();
                            newMat.color.set(color);
                            return newMat;
                        });
                    } else {
                        // Clone the material to avoid affecting other meshes
                        const newMaterial = child.material.clone();
                        newMaterial.color.set(color);
                        child.material = newMaterial;
                    }
                }
            }
        });
    }

    /**
     * Visualizes the robot model
     * @param {Object} robotData - The robot data from the URDF parser
     */
    async visualizeRobot(robotData) {
        this.logger.info('Starting robot visualization...');
        this.clearRobot();
        this.jointObjects.clear();
        
        const linkObjects = new Map();
        const meshStatus = document.getElementById(this.options.meshStatusId);
        if (meshStatus) meshStatus.textContent = 'Loading meshes...\n';
        
        // Create visual objects for each link
        for (const [linkName, linkData] of robotData.links) {
            this.logger.info(`Processing link: ${linkName}`);
            const linkGroup = new THREE.Group();
            linkGroup.name = linkName;
            
            if (linkData.visual) {
                this.logger.info(`Link ${linkName} has visual data`);
                if (linkData.visual.geometry) {
                    this.logger.info(`Link ${linkName} geometry type: ${linkData.visual.geometry.type}`);
                    if (linkData.visual.geometry.type === 'mesh') {
                        const filename = linkData.visual.geometry.filename;
                        this.logger.info(`Link ${linkName} has mesh: ${filename}`);
                        
                        if (meshStatus) meshStatus.textContent += `Loading ${filename}...\n`;
                        this.logger.info(`Attempting to load mesh for ${linkName}: ${filename}`);
                        
                        try {
                            const mesh = await this.meshLoader.loadMesh(filename);
                            this.meshLoader.applyTransformations(mesh, linkData.visual, filename);
                            
                            linkGroup.add(mesh);
                            if (meshStatus) meshStatus.textContent += `Added ${filename} to link ${linkName}\n`;
                            this.logger.success(`Successfully added mesh to link: ${linkName}`);
                        } catch (error) {
                            if (meshStatus) meshStatus.textContent += `Failed to load ${filename}: ${error}\n`;
                            this.logger.error(`Failed to load mesh for link ${linkName}: ${error.message}`);
                            // Create a placeholder geometry for failed loads
                            const placeholder = new THREE.BoxGeometry(0.1, 0.1, 0.1);
                            const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
                            const placeholderMesh = new THREE.Mesh(placeholder, material);
                            linkGroup.add(placeholderMesh);
                            this.logger.warning(`Added placeholder geometry for ${linkName}`);
                        }
                    } else {
                        this.logger.info(`Link ${linkName} using primitive geometry: ${linkData.visual.geometry.type}`);
                    }
                } else {
                    this.logger.warning(`Link ${linkName} has visual data but no geometry`);
                }
            } else {
                this.logger.warning(`Link ${linkName} has no visual data`);
            }
            
            linkObjects.set(linkName, linkGroup);
        }
        
        this.logger.info('Building joint structure...');
        
        // Calculate link depths in the kinematic chain
        const linkDepths = new Map();
        
        // Initialize root links with depth 0
        for (const rootLink of robotData.rootLinks) {
            linkDepths.set(rootLink, 0);
        }
        
        // Traverse the tree to calculate depths
        const calculateDepths = (linkName, depth) => {
            // Get all joints where this link is the parent
            for (const [jointName, jointData] of robotData.joints) {
                if (jointData.parent === linkName) {
                    const childLink = jointData.child;
                    // Only update if we haven't visited this link or if we found a shorter path
                    if (!linkDepths.has(childLink) || linkDepths.get(childLink) > depth + 1) {
                        linkDepths.set(childLink, depth + 1);
                        calculateDepths(childLink, depth + 1);
                    }
                }
            }
        };
        
        // Start depth calculation from root links
        for (const rootLink of robotData.rootLinks) {
            calculateDepths(rootLink, 0);
        }
        
        // Apply colors based on link depths
        for (const [linkName, depth] of linkDepths) {
            const linkObject = linkObjects.get(linkName);
            if (linkObject) {
                const color = this.generateLinkColor(depth);
                this.applyColorToGroup(linkObject, color);
                this.logger.info(`Applied color to link ${linkName} at depth ${depth}`);
            }
        }
        
        // Build the tree structure
        for (const [jointName, jointData] of robotData.joints) {
            const parentLink = linkObjects.get(jointData.parent);
            const childLink = linkObjects.get(jointData.child);
            
            if (parentLink && childLink) {
                this.logger.info(`Processing joint: ${jointName} (${jointData.parent} -> ${jointData.child})`);
                const jointGroup = new THREE.Group();
                jointGroup.name = jointName;
                
                if (jointData.origin) {
                    const xyz = jointData.origin.xyz || [0, 0, 0];
                    const rpy = jointData.origin.rpy || [0, 0, 0];
                    jointGroup.position.set(xyz[0], xyz[1], xyz[2]);
                    jointGroup.rotation.set(rpy[0], rpy[1], rpy[2]);
                    this.logger.info(`Applied joint transform: pos=[${xyz.join(',')}], rot=[${rpy.join(',')}]`);
                }
                
                jointGroup.add(childLink);
                parentLink.add(jointGroup);
                this.jointObjects.set(jointName, jointGroup);
                
                // Create a gnomon (coordinate frame) for the joint axis
                const axisSize = 0.2; // Size of the gnomon
                const jointAxis = jointData.axis || [1, 0, 0];
                
                // Create a group for the gnomon
                const gnomonGroup = new THREE.Group();
                gnomonGroup.name = `${jointName}_gnomon`;
                
                // Create the three axes with standard colors
                // X axis - Red
                const xAxis = new THREE.ArrowHelper(
                    new THREE.Vector3(1, 0, 0),
                    new THREE.Vector3(0, 0, 0),
                    axisSize,
                    0xff0000, // Red
                    axisSize * 0.2, // Head length
                    axisSize * 0.1  // Head width
                );
                gnomonGroup.add(xAxis);
                
                // Y axis - Green
                const yAxis = new THREE.ArrowHelper(
                    new THREE.Vector3(0, 1, 0),
                    new THREE.Vector3(0, 0, 0),
                    axisSize,
                    0x00ff00, // Green
                    axisSize * 0.2, // Head length
                    axisSize * 0.1  // Head width
                );
                gnomonGroup.add(yAxis);
                
                // Z axis - Blue
                const zAxis = new THREE.ArrowHelper(
                    new THREE.Vector3(0, 0, 1),
                    new THREE.Vector3(0, 0, 0),
                    axisSize,
                    0x0000ff, // Blue
                    axisSize * 0.2, // Head length
                    axisSize * 0.1  // Head width
                );
                gnomonGroup.add(zAxis);
                
                // Highlight the joint's rotation axis with a thicker, yellow arrow
                const jointAxisVector = new THREE.Vector3(jointAxis[0], jointAxis[1], jointAxis[2]).normalize();
                const rotationAxis = new THREE.ArrowHelper(
                    jointAxisVector,
                    new THREE.Vector3(0, 0, 0),
                    axisSize * 1.2, // Make it slightly longer
                    0xffff00, // Yellow
                    axisSize * 0.25, // Larger head
                    axisSize * 0.15  // Thicker
                );
                gnomonGroup.add(rotationAxis);
                
                // Add text label for the joint name
                const textSprite = this.createTextSprite(jointName, { 
                    fontsize: 24, // Reduce font size further from 40 to 24
                    borderColor: {r:0, g:0, b:0, a:0.0}, // Transparent border (no outline)
                    backgroundColor: {r:255, g:255, b:255, a:0.7}, // Slightly transparent background
                    textColor: {r:0, g:0, b:0, a:1.0} // Black text
                });
                textSprite.position.set(0, 0, axisSize * 1.1); // Position even closer to the joint
                textSprite.scale.set(0.15, 0.08, 1.0); // Make the sprite even smaller
                gnomonGroup.add(textSprite);
                
                jointGroup.add(gnomonGroup);
                
                this.logger.info(`Added gnomon for joint ${jointName} with rotation axis: [${jointAxis.join(',')}]`);
            }
        }
        
        this.logger.info('Adding root links to scene...');
        for (const rootLink of robotData.rootLinks) {
            const rootObject = linkObjects.get(rootLink);
            if (rootObject) {
                this.robotGroup.add(rootObject);
                this.logger.success(`Added root link: ${rootLink}`);
            }
        }
        
        // Calculate the bounding box of the robot
        const box = new THREE.Box3().setFromObject(this.robotGroup);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        
        // Get the bottom of the bounding box (lowest Z point)
        const bottomPoint = new THREE.Vector3();
        box.getCenter(bottomPoint);
        bottomPoint.z -= size.z / 2; // Move to the bottom of the bounding box
        
        // Position the robot so its base is at Z=0 (on the grid) without scaling
        this.robotGroup.position.set(-bottomPoint.x, -bottomPoint.y, -bottomPoint.z);
        
        this.logger.info(`Positioned robot on base frame at actual size: bottom=[${bottomPoint.x.toFixed(3)},${bottomPoint.y.toFixed(3)},${bottomPoint.z.toFixed(3)}]`);
        
        // Adjust camera position to accommodate the unscaled robot
        this.spherical.radius = Math.max(maxDim * 1.5, 10); // Set camera distance based on robot size
        this.updateCameraPosition();
        
        // Set up joint animator
        this.jointAnimator.setJoints(this.jointObjects, this.urdfReader.robot.joints);
    }
    
    /**
     * Creates joint control buttons
     */
    createJointControls() {
        const jointControlsContainer = document.getElementById(this.options.jointControlsContainerId);
        if (!jointControlsContainer) {
            this.logger.error(`Joint controls container with ID '${this.options.jointControlsContainerId}' not found`);
            return;
        }
        
        jointControlsContainer.innerHTML = '';
        
        if (!this.jointObjects || this.jointObjects.size === 0) {
            this.logger.warning('No joints available to control');
            jointControlsContainer.innerHTML = '<p>No joints available to control</p>';
            return;
        }
        
        // Ensure the JointAnimator has the latest joint objects and data
        this.logger.debug(`Updating JointAnimator with ${this.jointObjects.size} joints`, true);
        this.jointAnimator.setJoints(this.jointObjects, this.urdfReader.robot.joints);
        
        // Show the joint controls section
        const jointControls = document.getElementById(this.options.jointControlsId);
        if (jointControls) {
            jointControls.style.display = 'block';
        }
        
        // Create controls for each joint
        let movableJointCount = 0;
        for (const [jointName, jointObject] of this.jointObjects) {
            // Get joint data from URDF reader
            const jointData = this.urdfReader.robot.joints.get(jointName);
            if (!jointData) {
                this.logger.warning(`Joint data not found for ${jointName}, skipping control creation`);
                continue;
            }
            
            // Skip fixed joints
            if (jointData.type === 'fixed') {
                this.logger.debug(`Skipping fixed joint ${jointName}`, true);
                continue;
            }
            
            movableJointCount++;
            
            const jointControlDiv = document.createElement('div');
            jointControlDiv.className = 'joint-control';
            jointControlDiv.dataset.jointName = jointName; // Store joint name in dataset for easier access
            
            // Create joint name and type display
            const jointNameDiv = document.createElement('div');
            jointNameDiv.className = 'joint-name';
            
            // Add joint type to the display
            let jointTypeInfo = jointData.type || 'unknown';
            jointNameDiv.textContent = `${jointName} (${jointTypeInfo})`;
            jointControlDiv.appendChild(jointNameDiv);
            
            // Add joint limits display if available and enabled
            if (this.options.showJointLimits && jointData.limit) {
                const limitsDiv = document.createElement('div');
                limitsDiv.className = 'joint-limits';
                const lowerDeg = (jointData.limit.lower * 180 / Math.PI).toFixed(1);
                const upperDeg = (jointData.limit.upper * 180 / Math.PI).toFixed(1);
                limitsDiv.textContent = `Limits: ${lowerDeg}° to ${upperDeg}°`;
                jointControlDiv.appendChild(limitsDiv);
            }
            
            const jointButtonsDiv = document.createElement('div');
            jointButtonsDiv.className = 'joint-buttons';
            
            // Calculate step size in radians
            const stepSizeRad = this.options.jointStepSize * Math.PI / 180;
            
            // Create decrement button
            const decrementButton = document.createElement('button');
            decrementButton.className = 'decrement';
            decrementButton.textContent = `-${this.options.jointStepSize}°`;
            decrementButton.dataset.jointName = jointName; // Store joint name in dataset
            decrementButton.dataset.action = 'decrement'; // Store action in dataset
            
            // Add continuous rotation with mousedown/touchstart events
            let decrementInterval;
            const handleDecrementStart = () => {
                try {
                    this.logger.debug(`Decrementing joint ${jointName} by ${stepSizeRad.toFixed(4)} radians`, true);
                    const result = this.jointAnimator.adjustJointAngle(jointName, -stepSizeRad);
                    if (result === null) {
                        this.logger.error(`Failed to decrement joint ${jointName}`);
                    } else {
                        this.updateJointAngleDisplay(jointName);
                    }
                    
                    decrementInterval = setInterval(() => {
                        const result = this.jointAnimator.adjustJointAngle(jointName, -stepSizeRad);
                        if (result === null) {
                            this.logger.error(`Failed to decrement joint ${jointName} in interval`);
                            stopDecrement(); // Stop the interval if we failed
                        } else {
                            this.updateJointAngleDisplay(jointName);
                        }
                    }, 100); // Adjust every 100ms while button is held
                } catch (error) {
                    this.logger.error(`Error in decrement handler for joint ${jointName}: ${error.message}`);
                    stopDecrement();
                }
            };
            
            // Stop on mouseup/mouseleave/touchend
            const stopDecrement = () => {
                if (decrementInterval) {
                    clearInterval(decrementInterval);
                    decrementInterval = null;
                }
            };
            
            decrementButton.addEventListener('mousedown', handleDecrementStart);
            decrementButton.addEventListener('touchstart', handleDecrementStart);
            decrementButton.addEventListener('mouseup', stopDecrement);
            decrementButton.addEventListener('mouseleave', stopDecrement);
            decrementButton.addEventListener('touchend', stopDecrement);
            
            jointButtonsDiv.appendChild(decrementButton);
            
            // Create increment button
            const incrementButton = document.createElement('button');
            incrementButton.className = 'increment';
            incrementButton.textContent = `+${this.options.jointStepSize}°`;
            incrementButton.dataset.jointName = jointName; // Store joint name in dataset
            incrementButton.dataset.action = 'increment'; // Store action in dataset
            
            // Add continuous rotation with mousedown/touchstart events
            let incrementInterval;
            const handleIncrementStart = () => {
                try {
                    this.logger.debug(`Incrementing joint ${jointName} by ${stepSizeRad.toFixed(4)} radians`, true);
                    const result = this.jointAnimator.adjustJointAngle(jointName, stepSizeRad);
                    if (result === null) {
                        this.logger.error(`Failed to increment joint ${jointName}`);
                    } else {
                        this.updateJointAngleDisplay(jointName);
                    }
                    
                    incrementInterval = setInterval(() => {
                        const result = this.jointAnimator.adjustJointAngle(jointName, stepSizeRad);
                        if (result === null) {
                            this.logger.error(`Failed to increment joint ${jointName} in interval`);
                            stopIncrement(); // Stop the interval if we failed
                        } else {
                            this.updateJointAngleDisplay(jointName);
                        }
                    }, 100); // Adjust every 100ms while button is held
                } catch (error) {
                    this.logger.error(`Error in increment handler for joint ${jointName}: ${error.message}`);
                    stopIncrement();
                }
            };
            
            // Stop on mouseup/mouseleave/touchend
            const stopIncrement = () => {
                if (incrementInterval) {
                    clearInterval(incrementInterval);
                    incrementInterval = null;
                }
            };
            
            incrementButton.addEventListener('mousedown', handleIncrementStart);
            incrementButton.addEventListener('touchstart', handleIncrementStart);
            incrementButton.addEventListener('mouseup', stopIncrement);
            incrementButton.addEventListener('mouseleave', stopIncrement);
            incrementButton.addEventListener('touchend', stopIncrement);
            
            jointButtonsDiv.appendChild(incrementButton);
            
            // Add reset button
            const resetButton = document.createElement('button');
            resetButton.className = 'reset';
            resetButton.textContent = 'Reset';
            resetButton.dataset.jointName = jointName; // Store joint name in dataset
            resetButton.dataset.action = 'reset'; // Store action in dataset
            
            resetButton.addEventListener('click', () => {
                try {
                    this.logger.debug(`Resetting joint ${jointName}`, true);
                    // Reset this specific joint
                    if (jointData.limit) {
                        // Reset to middle of range if limits exist
                        const midPosition = (jointData.limit.upper + jointData.limit.lower) / 2;
                        this.urdfReader.setJointPosition(jointName, midPosition);
                        this.jointAnimator.resetJoint(jointName, jointObject, jointData);
                    } else {
                        // Reset to zero if no limits
                        this.urdfReader.setJointPosition(jointName, 0);
                        this.jointAnimator.resetJoint(jointName, jointObject, jointData);
                    }
                    this.updateJointAngleDisplay(jointName);
                } catch (error) {
                    this.logger.error(`Error resetting joint ${jointName}: ${error.message}`);
                }
            });
            
            jointButtonsDiv.appendChild(resetButton);
            
            jointControlDiv.appendChild(jointButtonsDiv);
            
            // Add angle display
            const jointAngleDiv = document.createElement('div');
            jointAngleDiv.className = 'joint-angle';
            jointAngleDiv.id = `angle-${jointName}`;
            
            // Initialize with current angle
            let currentAngle = 0;
            try {
                currentAngle = this.urdfReader.getJointPosition(jointName) || 0;
            } catch (error) {
                this.logger.error(`Error getting initial joint position for ${jointName}: ${error.message}`);
            }
            jointAngleDiv.textContent = `${(currentAngle * 180 / Math.PI).toFixed(2)}°`;
            
            jointControlDiv.appendChild(jointAngleDiv);
            
            // Add slider for joint control if limits are available
            if (jointData.limit) {
                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'slider-container';
                
                const slider = document.createElement('input');
                slider.type = 'range';
                slider.className = 'joint-slider';
                slider.min = jointData.limit.lower * 180 / Math.PI;
                slider.max = jointData.limit.upper * 180 / Math.PI;
                slider.step = 0.1;
                slider.value = currentAngle * 180 / Math.PI;
                slider.dataset.jointName = jointName; // Store joint name in dataset
                
                slider.addEventListener('input', (event) => {
                    try {
                        const angleDeg = parseFloat(event.target.value);
                        const angleRad = angleDeg * Math.PI / 180;
                        
                        // Update the position in the URDF reader
                        this.urdfReader.setJointPosition(jointName, angleRad);
                        
                        // Update the joint angle in the animator
                        // Instead of using adjustJointAngle with 0, directly set the angle
                        const jointObject = this.jointObjects.get(jointName);
                        if (jointObject && jointData) {
                            // Reset transformation
                            jointObject.position.set(0, 0, 0);
                            jointObject.quaternion.set(0, 0, 0, 1);
                            jointObject.scale.set(1, 1, 1);
                            
                            // Apply original transform from URDF
                            if (jointData.origin) {
                                const xyz = jointData.origin.xyz || [0, 0, 0];
                                const rpy = jointData.origin.rpy || [0, 0, 0];
                                
                                // Apply position
                                jointObject.position.set(xyz[0], xyz[1], xyz[2]);
                                
                                // Apply original rotation
                                const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
                                jointObject.setRotationFromEuler(euler);
                            }
                            
                            // Apply joint rotation around axis
                            const axis = jointData.axis || [0, 0, 1];
                            const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
                            const rotQuat = new THREE.Quaternion();
                            rotQuat.setFromAxisAngle(axisVec, angleRad);
                            
                            // Combine with existing rotation
                            jointObject.quaternion.multiply(rotQuat);
                            
                            // Update the joint angle in the animator's internal state
                            this.jointAnimator.jointAngles.set(jointName, angleRad);
                        }
                        
                        // Update the angle display
                        this.updateJointAngleDisplay(jointName);
                        
                        this.logger.debug(`Slider set joint ${jointName} to ${angleDeg.toFixed(2)}° (${angleRad.toFixed(4)} rad)`);
                    } catch (error) {
                        this.logger.error(`Error updating joint ${jointName} from slider: ${error.message}`);
                    }
                });
                
                sliderContainer.appendChild(slider);
                jointControlDiv.appendChild(sliderContainer);
            }
            
            jointControlsContainer.appendChild(jointControlDiv);
        }
        
        if (movableJointCount === 0) {
            jointControlsContainer.innerHTML = '<p>No movable joints available to control</p>';
            return;
        }
        
        // Add global reset button
        const globalResetDiv = document.createElement('div');
        globalResetDiv.className = 'global-reset';
        
        const globalResetButton = document.createElement('button');
        globalResetButton.textContent = 'Reset All Joints';
        globalResetButton.addEventListener('click', () => {
            try {
                this.logger.debug('Resetting all joints', true);
                this.urdfReader.resetJointPositions();
                this.jointAnimator.resetJointAngles();
                this.updateAllJointAngleDisplays();
            } catch (error) {
                this.logger.error(`Error resetting all joints: ${error.message}`);
            }
        });
        
        globalResetDiv.appendChild(globalResetButton);
        jointControlsContainer.appendChild(globalResetDiv);
        
        this.logger.info(`Joint control buttons created for ${movableJointCount} movable joints`);
        
        // Initialize all joint angle displays
        this.updateAllJointAngleDisplays();
    }
    
    /**
     * Updates the display of a joint angle
     * @param {string} jointName - The name of the joint
     */
    updateJointAngleDisplay(jointName) {
        const angleDisplay = document.getElementById(`angle-${jointName}`);
        if (!angleDisplay) {
            this.logger.debug(`Angle display element not found for joint ${jointName}`);
            return;
        }
        
        let currentAngle = 0;
        
        // Try to get the angle from the URDFReader first
        try {
            if (this.urdfReader && typeof this.urdfReader.getJointPosition === 'function') {
                const position = this.urdfReader.getJointPosition(jointName);
                if (position !== null) {
                    currentAngle = position;
                }
            } else if (this.jointAnimator) {
                // Fall back to the JointAnimator
                currentAngle = this.jointAnimator.getJointAngle(jointName);
            }
        } catch (error) {
            this.logger.error(`Error getting joint angle for ${jointName}: ${error.message}`);
            // Fall back to the JointAnimator
            if (this.jointAnimator) {
                currentAngle = this.jointAnimator.getJointAngle(jointName);
            }
        }
        
        angleDisplay.textContent = `${(currentAngle * 180 / Math.PI).toFixed(2)}°`;
        
        // Update slider if it exists
        try {
            const jointControl = document.querySelector(`[data-joint-name="${jointName}"]`);
            if (jointControl) {
                const slider = jointControl.querySelector('.joint-slider');
                if (slider) {
                    slider.value = currentAngle * 180 / Math.PI;
                }
            }
        } catch (error) {
            // Silently ignore errors with finding the slider
            this.logger.debug(`Could not update slider for joint ${jointName}: ${error.message}`);
        }
    }
    
    /**
     * Updates all joint angle displays
     */
    updateAllJointAngleDisplays() {
        for (const jointName of this.jointObjects.keys()) {
            this.updateJointAngleDisplay(jointName);
        }
    }
    
    /**
     * Creates a text sprite for labels in the 3D scene
     * @param {string} message - The text to display
     * @param {Object} parameters - Configuration parameters
     * @returns {THREE.Sprite} - The text sprite
     */
    createTextSprite(message, parameters = {}) {
        if (parameters === undefined) parameters = {};
        
        const fontface = parameters.fontface || 'Arial';
        const fontsize = parameters.fontsize || 18;
        const borderThickness = parameters.borderThickness || 2; // Reduced from 4 to 2
        const borderColor = parameters.borderColor || { r:0, g:0, b:0, a:0.0 }; // Default to transparent border
        const backgroundColor = parameters.backgroundColor || { r:255, g:255, b:255, a:0.7 }; // Default to semi-transparent
        const textColor = parameters.textColor || { r:0, g:0, b:0, a:1.0 };
        
        // Create canvas
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        context.font = "Bold " + fontsize + "px " + fontface;
        
        // Get text metrics
        const metrics = context.measureText(message);
        const textWidth = metrics.width;
        
        // Set canvas dimensions - make it more compact
        const padding = borderColor.a > 0 ? borderThickness : 1; // Minimal padding for small text
        const width = textWidth + padding * 2;
        const height = fontsize * 1.1 + padding * 2; // Reduce height ratio
        canvas.width = width;
        canvas.height = height;
        
        // Redraw with new canvas dimensions
        context.font = "Bold " + fontsize + "px " + fontface;
        context.fillStyle = "rgba("+backgroundColor.r+","+backgroundColor.g+","+backgroundColor.b+","+backgroundColor.a+")";
        
        // Only draw border if it's visible
        if (borderColor.a > 0) {
            context.strokeStyle = "rgba("+borderColor.r+","+borderColor.g+","+borderColor.b+","+borderColor.a+")";
            context.lineWidth = borderThickness;
            
            // Draw rounded rectangle with border
            this.roundRect(context, padding/2, padding/2, width - padding, height - padding, 2); // Smaller corner radius
        } else {
            // Just draw the background without border
            this.roundRect(context, 0, 0, width, height, 2); // Smaller corner radius
        }
        
        // Draw text
        context.fillStyle = "rgba("+textColor.r+","+textColor.g+","+textColor.b+","+textColor.a+")";
        context.fillText(message, padding, fontsize + padding/2); // Adjust text position
        
        // Create texture and sprite
        const texture = new THREE.Texture(canvas);
        texture.needsUpdate = true;
        
        const spriteMaterial = new THREE.SpriteMaterial({ 
            map: texture,
            transparent: true // Enable transparency
        });
        const sprite = new THREE.Sprite(spriteMaterial);
        
        return sprite;
    }
    
    /**
     * Helper function to draw a rounded rectangle on a canvas context
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} width - Width of the rectangle
     * @param {number} height - Height of the rectangle
     * @param {number} radius - Corner radius
     */
    roundRect(ctx, x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
} 