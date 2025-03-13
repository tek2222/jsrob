class URDFReader {
    constructor() {
        this.robot = {
            name: '',
            links: new Map(),
            joints: new Map(),
            rootLinks: [],
            tree: new Map(),
            actuators: new Map()
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
            tree: new Map(),
            actuators: new Map()
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

        // Parse actuators/transmissions if available
        const transmissions = robot.getElementsByTagName('transmission');
        for (const transmission of transmissions) {
            this.parseTransmission(transmission);
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

        // Print summary of joint limits
        console.log('\nJoint Limits Summary:');
        console.log('-------------------');
        for (const [jointName, joint] of this.robot.joints) {
            if (joint.limit) {
                console.log(`Joint "${jointName}": lower=${joint.limit.lower}, upper=${joint.limit.upper}, effort=${joint.limit.effort}, velocity=${joint.limit.velocity}`);
            } else {
                console.log(`Joint "${jointName}": no limits defined`);
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
        if (!geometryElement) {
            console.log('No geometry element found');
            return null;
        }

        const geometry = {};
        const child = geometryElement.firstElementChild;
        if (!child) {
            console.log('Geometry element has no children');
            return null;
        }

        console.log('Parsing geometry of type:', child.tagName);

        switch (child.tagName) {
            case 'box':
                geometry.type = 'box';
                geometry.size = this.parseXYZ(child.getAttribute('size'));
                console.log('Found box geometry:', geometry.size);
                break;
            case 'cylinder':
                geometry.type = 'cylinder';
                geometry.radius = parseFloat(child.getAttribute('radius'));
                geometry.length = parseFloat(child.getAttribute('length'));
                console.log('Found cylinder geometry:', { radius: geometry.radius, length: geometry.length });
                break;
            case 'sphere':
                geometry.type = 'sphere';
                geometry.radius = parseFloat(child.getAttribute('radius'));
                console.log('Found sphere geometry:', { radius: geometry.radius });
                break;
            case 'mesh':
                const fullPath = child.getAttribute('filename');
                console.log('Found mesh with path:', fullPath);
                
                // Handle both DAE and STL files
                if (fullPath.toLowerCase().endsWith('.dae') || fullPath.toLowerCase().endsWith('.stl')) {
                    geometry.type = 'mesh';
                    // Extract just the filename from the package:// path
                    const filename = fullPath.split('/').pop();
                    geometry.filename = filename;
                    console.log('Processing mesh file:', filename);
                    
                    if (child.getAttribute('scale')) {
                        geometry.scale = this.parseXYZ(child.getAttribute('scale'));
                        console.log('Mesh scale:', geometry.scale);
                    }
                } else {
                    console.log('Unsupported mesh format:', fullPath);
                    return null;
                }
                break;
            default:
                console.log('Unknown geometry type:', child.tagName);
                return null;
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
            mimic: this.parseMimic(jointElement.getElementsByTagName('mimic')[0]),
            currentPosition: 0,
            targetPosition: 0,
            isMoving: false
        };

        this.robot.joints.set(name, joint);
    }

    parseTransmission(transmissionElement) {
        if (!transmissionElement) return null;

        const name = transmissionElement.getAttribute('name');
        if (!name) return;

        const type = transmissionElement.getElementsByTagName('type')[0]?.textContent;
        const jointElement = transmissionElement.getElementsByTagName('joint')[0];
        const actuatorElement = transmissionElement.getElementsByTagName('actuator')[0];

        if (!jointElement || !actuatorElement) return;

        const jointName = jointElement.getAttribute('name');
        const actuatorName = actuatorElement.getAttribute('name');

        if (!jointName || !actuatorName) return;

        const hardwareInterface = jointElement.getElementsByTagName('hardwareInterface')[0]?.textContent;
        const mechanicalReduction = parseFloat(transmissionElement.getElementsByTagName('mechanicalReduction')[0]?.textContent) || 1.0;

        const actuator = {
            name: actuatorName,
            type: type,
            jointName: jointName,
            hardwareInterface: hardwareInterface,
            mechanicalReduction: mechanicalReduction
        };

        this.robot.actuators.set(actuatorName, actuator);
        
        // Link the actuator to the joint
        const joint = this.robot.joints.get(jointName);
        if (joint) {
            joint.actuator = actuatorName;
        }
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
            lower: parseFloat(limitElement.getAttribute('lower') || 0),
            upper: parseFloat(limitElement.getAttribute('upper') || 0),
            effort: parseFloat(limitElement.getAttribute('effort') || 0),
            velocity: parseFloat(limitElement.getAttribute('velocity') || 0)
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
            damping: parseFloat(dynamicsElement.getAttribute('damping') || 0),
            friction: parseFloat(dynamicsElement.getAttribute('friction') || 0)
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
            multiplier: parseFloat(mimicElement.getAttribute('multiplier') || 1),
            offset: parseFloat(mimicElement.getAttribute('offset') || 0)
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
                const joint = this.robot.joints.get(child.joint);
                let jointInfo = child.joint;
                
                if (joint && joint.type !== 'fixed') {
                    if (joint.limit) {
                        jointInfo += ` [${joint.type}, ${joint.limit.lower.toFixed(2)} to ${joint.limit.upper.toFixed(2)}]`;
                    } else {
                        jointInfo += ` [${joint.type}]`;
                    }
                }
                
                output += prefix + (isLast ? '    ' : '│   ') + `[${jointInfo}]` + '\n';
                displayNode(child.child, level + 1, isLastChild);
            }
        };

        for (const rootLink of this.robot.rootLinks) {
            displayNode(rootLink);
        }

        return output;
    }

    /**
     * Set a joint position while respecting joint limits
     * @param {string} jointName - The name of the joint to set
     * @param {number} position - The target position in radians
     * @returns {number} - The actual position after applying limits
     */
    setJointPosition(jointName, position) {
        const joint = this.robot.joints.get(jointName);
        if (!joint) {
            console.warn(`Joint ${jointName} not found`);
            return null;
        }

        // Only movable joints can have their position set
        if (joint.type === 'fixed') {
            console.warn(`Cannot set position for fixed joint ${jointName}`);
            return joint.currentPosition;
        }

        // Apply joint limits if they exist
        let limitedPosition = position;
        if (joint.limit) {
            limitedPosition = Math.max(joint.limit.lower, Math.min(joint.limit.upper, position));
            
            // Log if the position was limited
            if (limitedPosition !== position) {
                console.warn(`Joint ${jointName} position limited from ${position.toFixed(4)} to ${limitedPosition.toFixed(4)} [limits: ${joint.limit.lower.toFixed(4)} to ${joint.limit.upper.toFixed(4)}]`);
            }
        }

        // Update the joint position
        joint.currentPosition = limitedPosition;
        return limitedPosition;
    }

    /**
     * Get the current position of a joint
     * @param {string} jointName - The name of the joint
     * @returns {number} - The current position in radians
     */
    getJointPosition(jointName) {
        const joint = this.robot.joints.get(jointName);
        if (!joint) {
            console.warn(`Joint ${jointName} not found`);
            return null;
        }
        return joint.currentPosition;
    }

    /**
     * Get the joint limits
     * @param {string} jointName - The name of the joint
     * @returns {Object|null} - The joint limits or null if not defined
     */
    getJointLimits(jointName) {
        const joint = this.robot.joints.get(jointName);
        if (!joint) {
            console.warn(`Joint ${jointName} not found`);
            return null;
        }
        return joint.limit;
    }

    /**
     * Check if a joint position is within limits
     * @param {string} jointName - The name of the joint
     * @param {number} position - The position to check
     * @returns {boolean} - True if within limits or no limits defined
     */
    isWithinJointLimits(jointName, position) {
        const joint = this.robot.joints.get(jointName);
        if (!joint) {
            console.warn(`Joint ${jointName} not found`);
            return false;
        }

        if (!joint.limit) {
            // No limits defined, so any position is valid
            return true;
        }

        return position >= joint.limit.lower && position <= joint.limit.upper;
    }

    /**
     * Get all movable joints (non-fixed)
     * @returns {Array} - Array of joint names
     */
    getMovableJoints() {
        return Array.from(this.robot.joints.entries())
            .filter(([_, joint]) => joint.type !== 'fixed')
            .map(([name, _]) => name);
    }

    /**
     * Get information about an actuator
     * @param {string} actuatorName - The name of the actuator
     * @returns {Object|null} - The actuator data or null if not found
     */
    getActuator(actuatorName) {
        return this.robot.actuators.get(actuatorName) || null;
    }

    /**
     * Get the actuator associated with a joint
     * @param {string} jointName - The name of the joint
     * @returns {Object|null} - The actuator data or null if not found
     */
    getJointActuator(jointName) {
        const joint = this.robot.joints.get(jointName);
        if (!joint || !joint.actuator) {
            return null;
        }
        return this.robot.actuators.get(joint.actuator) || null;
    }

    /**
     * Reset all joint positions to zero or their default positions
     */
    resetJointPositions() {
        for (const joint of this.robot.joints.values()) {
            if (joint.type !== 'fixed') {
                // Set to middle of range if limits exist, otherwise zero
                if (joint.limit) {
                    joint.currentPosition = (joint.limit.upper + joint.limit.lower) / 2;
                } else {
                    joint.currentPosition = 0;
                }
            }
        }
    }
} 