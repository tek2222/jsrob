let camera, scene, renderer;
let joints = [];
let links = new Set();
let robotStructure = {};

// Camera rotation parameters
let spherical = {
    radius: 10,
    phi: Math.PI / 4,    // vertical angle
    theta: Math.PI / 4   // horizontal angle
};

// Mouse control variables
let isDragging = false;
let previousMousePosition = {
    x: 0,
    y: 0
};

// Initialize the 3D scene
function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6);

    // Camera
    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    updateCameraPosition();

    // Renderer
    const container = document.getElementById('webgl-container');
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Grid
    const grid = new THREE.GridHelper(20, 20, 0x000000, 0x888888);
    scene.add(grid);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Event Listeners
    container.addEventListener('mousedown', onMouseDown);
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseleave', onMouseUp);
    container.addEventListener('wheel', onMouseWheel);
    window.addEventListener('resize', onWindowResize);

    animate();
}

// Camera control functions
function updateCameraPosition() {
    camera.position.x = spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
    camera.position.y = spherical.radius * Math.cos(spherical.phi);
    camera.position.z = spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
    camera.lookAt(0, 0, 0);
}

function onMouseDown(event) {
    isDragging = true;
    const rect = event.target.getBoundingClientRect();
    previousMousePosition = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

function onMouseMove(event) {
    if (!isDragging) return;

    const rect = event.target.getBoundingClientRect();
    const currentPosition = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };

    const deltaMove = {
        x: currentPosition.x - previousMousePosition.x,
        y: currentPosition.y - previousMousePosition.y
    };

    const rotationSpeed = 0.01;
    spherical.theta -= deltaMove.x * rotationSpeed;
    spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi + deltaMove.y * rotationSpeed));

    updateCameraPosition();
    previousMousePosition = currentPosition;
}

function onMouseUp() {
    isDragging = false;
}

function onMouseWheel(event) {
    event.preventDefault();
    const zoomSpeed = 0.1;
    const minDistance = 2;
    const maxDistance = 20;
    const zoomDelta = event.deltaY * zoomSpeed;
    spherical.radius = Math.max(minDistance, Math.min(maxDistance, spherical.radius + zoomDelta));
    updateCameraPosition();
}

function onWindowResize() {
    const container = document.getElementById('webgl-container');
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

class URDFReader {
    constructor() {
        this.robot = {
            name: '',
            links: new Map(),
            joints: new Map(),
            rootLinks: [],
            tree: new Map()
        };
    }

    async loadModelFromFile(filename) {
        try {
            const timestamp = new Date().getTime();
            const response = await fetch(`/public/models/${filename}?t=${timestamp}`);
            if (!response.ok) {
                throw new Error(`Failed to load URDF file: ${filename}`);
            }
            const urdfText = await response.text();
            return this.parse(urdfText);
        } catch (error) {
            console.error('Error loading URDF:', error);
            throw error;
        }
    }

    parse(urdfText) {
        // Reset robot data
        this.robot = {
            name: '',
            links: new Map(),
            joints: new Map(),
            rootLinks: [],
            tree: new Map()
        };

        const parser = new DOMParser();
        const doc = parser.parseFromString(urdfText, 'text/xml');
        const robot = doc.getElementsByTagName('robot')[0];
        
        if (!robot) {
            throw new Error('No robot element found in URDF');
        }

        this.robot.name = robot.getAttribute('name') || 'unnamed_robot';
        console.log('\nParsing URDF for robot:', this.robot.name);
        console.log('-------------------');

        // Parse links first
        const links = robot.getElementsByTagName('link');
        for (const link of links) {
            this.parseLink(link);
        }

        // Parse joints
        const joints = robot.getElementsByTagName('joint');
        for (const joint of joints) {
            this.parseJoint(joint);
        }

        // Build tree structure
        this.buildTree();

        // Print summary of STL files
        console.log('\nSTL Files Summary:');
        console.log('-------------------');
        for (const [linkName, link] of this.robot.links) {
            if (link.visual && link.visual.geometry && link.visual.geometry.type === 'mesh') {
                const filename = link.visual.geometry.filename;
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                    console.log(`Link "${linkName}": ${filename}`);
                }
            }
        }
        console.log('-------------------\n');

        return this.robot;
    }

    parseLink(linkElement) {
        const name = linkElement.getAttribute('name');
        if (!name) return;

        const link = {
            name: name,
            visual: null,
            collision: null,
            inertial: null
        };

        // Parse visual
        const visual = linkElement.getElementsByTagName('visual')[0];
        if (visual) {
            link.visual = this.parseVisual(visual);
        }

        // Parse collision
        const collision = linkElement.getElementsByTagName('collision')[0];
        if (collision) {
            link.collision = this.parseVisual(collision);
        }

        // Parse inertial
        const inertial = linkElement.getElementsByTagName('inertial')[0];
        if (inertial) {
            link.inertial = this.parseInertial(inertial);
        }

        this.robot.links.set(name, link);
    }

    parseVisual(visualElement) {
        const visual = {
            origin: this.parseOrigin(visualElement.getElementsByTagName('origin')[0]),
            geometry: this.parseGeometry(visualElement.getElementsByTagName('geometry')[0]),
            material: this.parseMaterial(visualElement.getElementsByTagName('material')[0])
        };
        return visual;
    }

    parseGeometry(geometryElement) {
        if (!geometryElement) return null;

        const geometry = {};
        const child = geometryElement.firstElementChild;
        if (!child) return null;

        switch (child.tagName) {
            case 'box':
                geometry.type = 'box';
                geometry.size = this.parseXYZ(child.getAttribute('size'));
                break;
            case 'cylinder':
                geometry.type = 'cylinder';
                geometry.radius = parseFloat(child.getAttribute('radius'));
                geometry.length = parseFloat(child.getAttribute('length'));
                break;
            case 'sphere':
                geometry.type = 'sphere';
                geometry.radius = parseFloat(child.getAttribute('radius'));
                break;
            case 'mesh':
                const fullPath = child.getAttribute('filename');
                // Only process STL files
                if (fullPath.toLowerCase().endsWith('.stl')) {
                    geometry.type = 'mesh';
                    // Extract just the filename after the last slash
                    geometry.filename = fullPath.split('/').pop();
                    console.log('Found STL file:', geometry.filename);
                    if (child.getAttribute('scale')) {
                        geometry.scale = this.parseXYZ(child.getAttribute('scale'));
                    }
                } else {
                    // Skip non-STL files
                    console.log('Skipping non-STL mesh:', fullPath);
                    return null;
                }
                break;
        }
        return geometry;
    }

    parseMaterial(materialElement) {
        if (!materialElement) return null;

        const material = {};
        const color = materialElement.getElementsByTagName('color')[0];
        if (color) {
            material.color = this.parseRGBA(color.getAttribute('rgba'));
        }
        return material;
    }

    parseInertial(inertialElement) {
        if (!inertialElement) return null;

        const inertial = {};
        const mass = inertialElement.getElementsByTagName('mass')[0];
        const inertia = inertialElement.getElementsByTagName('inertia')[0];

        if (mass) {
            inertial.mass = parseFloat(mass.getAttribute('value'));
        }
        if (inertia) {
            inertial.inertia = {
                ixx: parseFloat(inertia.getAttribute('ixx')),
                ixy: parseFloat(inertia.getAttribute('ixy')),
                ixz: parseFloat(inertia.getAttribute('ixz')),
                iyy: parseFloat(inertia.getAttribute('iyy')),
                iyz: parseFloat(inertia.getAttribute('iyz')),
                izz: parseFloat(inertia.getAttribute('izz'))
            };
        }
        return inertial;
    }

    parseJoint(jointElement) {
        const name = jointElement.getAttribute('name');
        const type = jointElement.getAttribute('type');
        const parent = jointElement.getElementsByTagName('parent')[0]?.getAttribute('link');
        const child = jointElement.getElementsByTagName('child')[0]?.getAttribute('link');

        if (!name || !type || !parent || !child) return;

        const joint = {
            name: name,
            type: type,
            parent: parent,
            child: child,
            origin: this.parseOrigin(jointElement.getElementsByTagName('origin')[0]),
            axis: this.parseXYZ(jointElement.getElementsByTagName('axis')[0]?.getAttribute('xyz')),
            limit: this.parseLimit(jointElement.getElementsByTagName('limit')[0]),
            calibration: this.parseCalibration(jointElement.getElementsByTagName('calibration')[0]),
            dynamics: this.parseDynamics(jointElement.getElementsByTagName('dynamics')[0]),
            safety_controller: this.parseSafetyController(jointElement.getElementsByTagName('safety_controller')[0]),
            mimic: this.parseMimic(jointElement.getElementsByTagName('mimic')[0])
        };

        this.robot.joints.set(name, joint);
    }

    parseOrigin(originElement) {
        if (!originElement) return null;

        return {
            xyz: this.parseXYZ(originElement.getAttribute('xyz')),
            rpy: this.parseRPY(originElement.getAttribute('rpy'))
        };
    }

    parseXYZ(xyzString) {
        if (!xyzString) return [0, 0, 0];
        return xyzString.split(' ').map(Number);
    }

    parseRPY(rpyString) {
        if (!rpyString) return [0, 0, 0];
        return rpyString.split(' ').map(Number);
    }

    parseRGBA(rgbaString) {
        if (!rgbaString) return [0.8, 0.8, 0.8, 1];
        return rgbaString.split(' ').map(Number);
    }

    parseLimit(limitElement) {
        if (!limitElement) return null;

        return {
            lower: parseFloat(limitElement.getAttribute('lower')),
            upper: parseFloat(limitElement.getAttribute('upper')),
            effort: parseFloat(limitElement.getAttribute('effort')),
            velocity: parseFloat(limitElement.getAttribute('velocity'))
        };
    }

    parseCalibration(calibrationElement) {
        if (!calibrationElement) return null;

        return {
            rising: parseFloat(calibrationElement.getAttribute('rising')),
            falling: parseFloat(calibrationElement.getAttribute('falling'))
        };
    }

    parseDynamics(dynamicsElement) {
        if (!dynamicsElement) return null;

        return {
            damping: parseFloat(dynamicsElement.getAttribute('damping')),
            friction: parseFloat(dynamicsElement.getAttribute('friction'))
        };
    }

    parseSafetyController(safetyControllerElement) {
        if (!safetyControllerElement) return null;

        return {
            soft_lower_limit: parseFloat(safetyControllerElement.getAttribute('soft_lower_limit')),
            soft_upper_limit: parseFloat(safetyControllerElement.getAttribute('soft_upper_limit')),
            k_position: parseFloat(safetyControllerElement.getAttribute('k_position')),
            k_velocity: parseFloat(safetyControllerElement.getAttribute('k_velocity'))
        };
    }

    parseMimic(mimicElement) {
        if (!mimicElement) return null;

        return {
            joint: mimicElement.getAttribute('joint'),
            multiplier: parseFloat(mimicElement.getAttribute('multiplier')),
            offset: parseFloat(mimicElement.getAttribute('offset'))
        };
    }

    buildTree() {
        // Find root links (links that are not children in any joint)
        const childLinks = new Set();
        for (const joint of this.robot.joints.values()) {
            childLinks.add(joint.child);
        }

        this.robot.rootLinks = Array.from(this.robot.links.keys())
            .filter(link => !childLinks.has(link));

        // Build parent-child relationships
        for (const [jointName, joint] of this.robot.joints) {
            const parentLink = joint.parent;
            const childLink = joint.child;

            if (!this.robot.tree.has(parentLink)) {
                this.robot.tree.set(parentLink, []);
            }
            this.robot.tree.get(parentLink).push({
                joint: jointName,
                child: childLink
            });
        }
    }

    async checkSTLFiles() {
        console.log('\nChecking STL files...');
        console.log('-------------------');

        for (const [linkName, link] of this.robot.links) {
            if (link.visual && link.visual.geometry && link.visual.geometry.type === 'mesh') {
                const filename = link.visual.geometry.filename;
                if (filename && filename.toLowerCase().endsWith('.stl')) {
                    try {
                        const timestamp = new Date().getTime();
                        const response = await fetch(`/public/models/${filename}?t=${timestamp}`);
                        if (response.ok) {
                            console.log(`✓ Found STL file for link "${linkName}": ${filename}`);
                        } else {
                            console.log(`✗ Missing STL file for link "${linkName}": ${filename}`);
                        }
                    } catch (error) {
                        console.log(`✗ Error checking STL file for link "${linkName}": ${filename}`);
                    }
                }
            }
        }
        console.log('-------------------\n');
    }

    getRobotTree() {
        return this.robot;
    }

    displayTreeStructure() {
        let output = `Robot: ${this.robot.name}\n\n`;
        
        const displayNode = (linkName, level = 0, isLast = true) => {
            const prefix = level === 0 ? '' : '│   '.repeat(level - 1) + (isLast ? '└── ' : '├── ');
            output += prefix + linkName + '\n';

            const children = this.robot.tree.get(linkName) || [];
            for (let i = 0; i < children.length; i++) {
                const child = children[i];
                const isLastChild = i === children.length - 1;
                output += prefix + (isLast ? '    ' : '│   ') + `[${child.joint}]` + '\n';
                displayNode(child.child, level + 1, isLastChild);
            }
        };

        for (const rootLink of this.robot.rootLinks) {
            displayNode(rootLink);
        }

        return output;
    }
}

// Initialize Three.js scene
init(); 