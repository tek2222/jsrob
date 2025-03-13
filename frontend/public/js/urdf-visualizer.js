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
            showJointLimits: true,
            jointStepSize: 2 // Default step size in degrees
        };
        
        this.options = { ...defaults, ...options };
        
        // Initialize components
        this.logger = new DebugLogger(this.options.debugConsoleId);
        this.urdfReader = new URDFReader();
        this.meshLoader = new MeshLoader(this.logger);
        this.jointAnimator = new JointAnimator(this.logger, this.urdfReader);
        
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
                
                const jointAxis = jointData.axis || [1, 0, 0];
                const axisHelper = new THREE.ArrowHelper(
                    new THREE.Vector3(jointAxis[0], jointAxis[1], jointAxis[2]),
                    new THREE.Vector3(0, 0, 0),
                    0.5,
                    0xff0000
                );
                jointGroup.add(axisHelper);
                this.logger.info(`Added joint axis indicator for ${jointName}: [${jointAxis.join(',')}]`);
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
        
        if (this.jointObjects.size === 0) {
            jointControlsContainer.innerHTML = '<p>No joints available to control</p>';
            return;
        }
        
        // Show the joint controls section
        const jointControls = document.getElementById(this.options.jointControlsId);
        if (jointControls) {
            jointControls.style.display = 'block';
        }
        
        // Create controls for each joint
        for (const [jointName, jointObject] of this.jointObjects) {
            const jointData = this.urdfReader.robot.joints.get(jointName);
            
            // Skip fixed joints
            if (jointData.type === 'fixed') {
                continue;
            }
            
            const jointControlDiv = document.createElement('div');
            jointControlDiv.className = 'joint-control';
            
            // Create joint name and type display
            const jointNameDiv = document.createElement('div');
            jointNameDiv.className = 'joint-name';
            
            // Add joint type to the display
            let jointTypeInfo = jointData.type;
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
            
            // Add continuous rotation with mousedown/touchstart events
            let decrementInterval;
            decrementButton.addEventListener('mousedown', () => {
                this.jointAnimator.adjustJointAngle(jointName, -stepSizeRad);
                this.updateJointAngleDisplay(jointName);
                decrementInterval = setInterval(() => {
                    this.jointAnimator.adjustJointAngle(jointName, -stepSizeRad);
                    this.updateJointAngleDisplay(jointName);
                }, 100); // Adjust every 100ms while button is held
            });
            
            // Stop on mouseup/mouseleave/touchend
            const stopDecrement = () => {
                if (decrementInterval) {
                    clearInterval(decrementInterval);
                    decrementInterval = null;
                }
            };
            
            decrementButton.addEventListener('mouseup', stopDecrement);
            decrementButton.addEventListener('mouseleave', stopDecrement);
            decrementButton.addEventListener('touchend', stopDecrement);
            
            jointButtonsDiv.appendChild(decrementButton);
            
            // Create increment button
            const incrementButton = document.createElement('button');
            incrementButton.className = 'increment';
            incrementButton.textContent = `+${this.options.jointStepSize}°`;
            
            // Add continuous rotation with mousedown/touchstart events
            let incrementInterval;
            incrementButton.addEventListener('mousedown', () => {
                this.jointAnimator.adjustJointAngle(jointName, stepSizeRad);
                this.updateJointAngleDisplay(jointName);
                incrementInterval = setInterval(() => {
                    this.jointAnimator.adjustJointAngle(jointName, stepSizeRad);
                    this.updateJointAngleDisplay(jointName);
                }, 100); // Adjust every 100ms while button is held
            });
            
            // Stop on mouseup/mouseleave/touchend
            const stopIncrement = () => {
                if (incrementInterval) {
                    clearInterval(incrementInterval);
                    incrementInterval = null;
                }
            };
            
            incrementButton.addEventListener('mouseup', stopIncrement);
            incrementButton.addEventListener('mouseleave', stopIncrement);
            incrementButton.addEventListener('touchend', stopIncrement);
            
            jointButtonsDiv.appendChild(incrementButton);
            
            // Add reset button
            const resetButton = document.createElement('button');
            resetButton.className = 'reset';
            resetButton.textContent = 'Reset';
            resetButton.addEventListener('click', () => {
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
            });
            
            jointButtonsDiv.appendChild(resetButton);
            
            jointControlDiv.appendChild(jointButtonsDiv);
            
            // Add angle display
            const jointAngleDiv = document.createElement('div');
            jointAngleDiv.className = 'joint-angle';
            jointAngleDiv.id = `angle-${jointName}`;
            
            // Initialize with current angle
            const currentAngle = this.urdfReader.getJointPosition(jointName) || 0;
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
                
                slider.addEventListener('input', (event) => {
                    const angleDeg = parseFloat(event.target.value);
                    const angleRad = angleDeg * Math.PI / 180;
                    this.urdfReader.setJointPosition(jointName, angleRad);
                    this.jointAnimator.adjustJointAngle(jointName, 0); // Force update with current angle
                    this.updateJointAngleDisplay(jointName);
                });
                
                sliderContainer.appendChild(slider);
                jointControlDiv.appendChild(sliderContainer);
            }
            
            jointControlsContainer.appendChild(jointControlDiv);
        }
        
        // Add global reset button
        const globalResetDiv = document.createElement('div');
        globalResetDiv.className = 'global-reset';
        
        const globalResetButton = document.createElement('button');
        globalResetButton.textContent = 'Reset All Joints';
        globalResetButton.addEventListener('click', () => {
            this.urdfReader.resetJointPositions();
            this.jointAnimator.resetJointAngles();
            this.updateAllJointAngleDisplays();
        });
        
        globalResetDiv.appendChild(globalResetButton);
        jointControlsContainer.appendChild(globalResetDiv);
        
        this.logger.info('Joint control buttons created');
        
        // Initialize all joint angle displays
        this.updateAllJointAngleDisplays();
    }
    
    /**
     * Updates the display of a joint angle
     * @param {string} jointName - The name of the joint
     */
    updateJointAngleDisplay(jointName) {
        const angleDisplay = document.getElementById(`angle-${jointName}`);
        if (angleDisplay) {
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
                // Use querySelector with a more specific selector that doesn't rely on :has
                const slider = document.querySelector(`#angle-${jointName}`).closest('.joint-control').querySelector('.joint-slider');
                if (slider) {
                    slider.value = currentAngle * 180 / Math.PI;
                }
            } catch (error) {
                // Silently ignore errors with finding the slider
                this.logger.debug(`Could not update slider for joint ${jointName}: ${error.message}`);
            }
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
} 