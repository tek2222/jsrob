class TransformationUtils {
    /**
     * Applies a joint transformation to a THREE.Object3D
     * @param {THREE.Object3D} jointObject - The joint object to transform
     * @param {Object} jointData - The joint data from URDF
     * @param {number} angle - The joint angle in radians
     */
    static applyJointTransform(jointObject, jointData, angle) {
        if (!jointObject || !jointData) return;

        // Reset transformation
        jointObject.position.set(0, 0, 0);
        jointObject.quaternion.set(0, 0, 0, 1);
        
        // Apply original transform from URDF
        if (jointData.origin) {
            const xyz = jointData.origin.xyz || [0, 0, 0];
            const rpy = jointData.origin.rpy || [0, 0, 0];
            jointObject.position.set(xyz[0], xyz[1], xyz[2]);
            const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
            jointObject.setRotationFromEuler(euler);
        }
        
        // Apply joint rotation
        const axis = jointData.axis || [0, 0, 1];
        const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        const rotQuat = new THREE.Quaternion();
        rotQuat.setFromAxisAngle(axisVec, angle);
        jointObject.quaternion.multiply(rotQuat);

        // Force update of matrix
        jointObject.updateMatrix();
        jointObject.updateMatrixWorld(true);
    }

    /**
     * Extracts position and orientation from a transformation matrix
     * @param {THREE.Matrix4} matrix - The transformation matrix
     * @returns {Object} Object containing position and orientation
     */
    static decomposeTransform(matrix) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        matrix.decompose(position, quaternion, scale);
        return { position, orientation: quaternion };
    }

    /**
     * Creates a transformation matrix from position and rotation
     * @param {Array} xyz - [x, y, z] position
     * @param {Array} rpy - [roll, pitch, yaw] rotation in radians
     * @returns {THREE.Matrix4} The resulting transformation matrix
     */
    static createTransformMatrix(xyz = [0, 0, 0], rpy = [0, 0, 0]) {
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromEuler(new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ'));
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        return matrix;
    }
}

class CostCalculator {
    /**
     * Calculates the position cost between two points
     * @param {THREE.Vector3} point1 - First point
     * @param {THREE.Vector3} point2 - Second point
     * @returns {number} The distance between the points
     */
    static calculatePositionCost(point1, point2) {
        return point1.distanceTo(point2);
    }

    /**
     * Calculates the rotation cost between two quaternions
     * @param {THREE.Quaternion} quat1 - First quaternion
     * @param {THREE.Quaternion} quat2 - Second quaternion
     * @returns {number} The angle between the quaternions in radians
     */
    static calculateRotationCost(quat1, quat2) {
        const dotProduct = Math.abs(quat1.dot(quat2));
        return Math.acos(Math.min(1, Math.max(-1, 2 * dotProduct * dotProduct - 1)));
    }

    /**
     * Calculates the combined position and rotation cost
     * @param {THREE.Vector3} point1 - First point
     * @param {THREE.Vector3} point2 - Second point
     * @param {THREE.Quaternion} quat1 - First quaternion
     * @param {THREE.Quaternion} quat2 - Second quaternion
     * @param {number} rotationWeight - Weight for rotation cost (0-1)
     * @returns {number} The weighted sum of position and rotation costs
     */
    static calculateCombinedCost(point1, point2, quat1, quat2, rotationWeight = 0.5) {
        const positionWeight = 1.0;
        const positionCost = this.calculatePositionCost(point1, point2);
        const rotationCost = this.calculateRotationCost(quat1, quat2);
        return (positionWeight * positionCost) + (rotationWeight * rotationCost);
    }
}

class RobotVisualizer {
    /**
     * Creates a new RobotVisualizer instance
     * @param {THREE.Scene} scene - The Three.js scene to render to
     * @param {DebugLogger} logger - The logger instance
     */
    constructor(scene, logger) {
        this.scene = scene;
        this.logger = logger;
        this.robotModel = null;
        this.jointObjects = new Map();
        this.linkObjects = new Map();
        this.stlLoader = new THREE.STLLoader();
        this.colladaLoader = new THREE.ColladaLoader();
    }

    /**
     * Visualizes a robot from URDF data
     * @param {Object} robotData - The parsed URDF data
     * @returns {Promise<void>}
     */
    async visualizeRobot(robotData) {
        this.logger.info('Starting robot visualization...');
        
        // Clear existing robot
        if (this.robotModel) {
            this.scene.remove(this.robotModel);
        }
        
        // Create new robot model group
        this.robotModel = new THREE.Group();
        this.scene.add(this.robotModel);
        
        // Create visual objects for each link
        await this.createLinkVisuals(robotData);
        
        // Build joint structure
        this.buildJointStructure(robotData);
        
        // Add root links to robot model
        this.addRootLinks(robotData);
        
        this.logger.success('Robot visualization complete');
        return this.robotModel;
    }

    /**
     * Creates visual objects for each link
     * @param {Object} robotData - The parsed URDF data
     * @private
     */
    async createLinkVisuals(robotData) {
        this.linkObjects.clear();
        
        for (const [linkName, linkData] of robotData.links) {
            this.logger.info(`Processing link: ${linkName}`);
            const linkGroup = new THREE.Group();
            linkGroup.name = linkName;

            if (linkData.visual && linkData.visual.geometry) {
                if (linkData.visual.geometry.type === 'mesh') {
                    try {
                        const mesh = await this.loadMesh(linkData.visual.geometry.filename);
                        this.applyVisualTransform(mesh, linkData.visual);
                        linkGroup.add(mesh);
                        this.logger.success(`Added mesh for link: ${linkName}`);
                    } catch (error) {
                        this.logger.error(`Failed to load mesh for link ${linkName}: ${error.message}`);
                        linkGroup.add(this.createPlaceholderGeometry());
                    }
                }
            }

            this.linkObjects.set(linkName, linkGroup);
        }
    }

    /**
     * Builds the joint structure connecting the links
     * @param {Object} robotData - The parsed URDF data
     * @private
     */
    buildJointStructure(robotData) {
        this.jointObjects.clear();
        
        for (const [jointName, jointData] of robotData.joints) {
            const parentLink = this.linkObjects.get(jointData.parent);
            const childLink = this.linkObjects.get(jointData.child);

            if (parentLink && childLink) {
                const jointGroup = new THREE.Group();
                jointGroup.name = jointName;
                
                if (jointData.origin) {
                    const transform = TransformationUtils.createTransformMatrix(
                        jointData.origin.xyz || [0, 0, 0],
                        jointData.origin.rpy || [0, 0, 0]
                    );
                    jointGroup.applyMatrix4(transform);
                }

                jointGroup.add(childLink);
                parentLink.add(jointGroup);
                this.jointObjects.set(jointName, jointGroup);
                
                // Add joint axis visualization
                this.addJointAxisVisualization(jointGroup, jointData);
            }
        }
    }

    /**
     * Adds root links to the robot model
     * @param {Object} robotData - The parsed URDF data
     * @private
     */
    addRootLinks(robotData) {
        for (const rootLink of robotData.rootLinks) {
            const rootObject = this.linkObjects.get(rootLink);
            if (rootObject) {
                this.robotModel.add(rootObject);
            }
        }
    }

    /**
     * Loads a mesh from file
     * @param {string} filename - The mesh filename
     * @returns {Promise<THREE.Object3D>}
     * @private
     */
    async loadMesh(filename) {
        return new Promise((resolve, reject) => {
            const meshPath = `/public/models/meshes/${filename}`;
            this.logger.info(`Loading mesh: ${meshPath}`);
            
            if (filename.toLowerCase().endsWith('.stl')) {
                this.loadSTLMesh(meshPath).then(resolve).catch(reject);
            } else if (filename.toLowerCase().endsWith('.dae')) {
                this.loadDAEMesh(meshPath).then(resolve).catch(reject);
            } else {
                reject(new Error(`Unsupported file format: ${filename}`));
            }
        });
    }

    /**
     * Loads an STL mesh
     * @param {string} path - The mesh file path
     * @returns {Promise<THREE.Mesh>}
     * @private
     */
    loadSTLMesh(path) {
        return new Promise((resolve, reject) => {
            this.stlLoader.load(
                path,
                (geometry) => {
                    geometry.computeBoundingBox();
                    geometry.center();
                    
                    const material = new THREE.MeshPhongMaterial({ 
                        color: 0x808080,
                        shininess: 30,
                        specular: 0x111111
                    });
                    
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.rotation.set(-Math.PI/2, 0, 0); // Fix STL orientation
                    resolve(mesh);
                },
                null,
                reject
            );
        });
    }

    /**
     * Loads a COLLADA (DAE) mesh
     * @param {string} path - The mesh file path
     * @returns {Promise<THREE.Object3D>}
     * @private
     */
    loadDAEMesh(path) {
        return new Promise((resolve, reject) => {
            this.colladaLoader.load(
                path,
                (collada) => {
                    collada.scene.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.matrixAutoUpdate = true;
                            child.updateMatrix();
                        }
                    });
                    resolve(collada.scene);
                },
                null,
                reject
            );
        });
    }

    /**
     * Applies visual transform to a mesh
     * @param {THREE.Object3D} mesh - The mesh to transform
     * @param {Object} visualData - The visual data from URDF
     * @private
     */
    applyVisualTransform(mesh, visualData) {
        if (visualData.origin) {
            const xyz = visualData.origin.xyz || [0, 0, 0];
            const rpy = visualData.origin.rpy || [0, 0, 0];
            mesh.position.set(xyz[0], xyz[1], xyz[2]);
            mesh.rotation.set(rpy[0], rpy[1], rpy[2]);
        }

        if (visualData.geometry.scale) {
            const scale = visualData.geometry.scale;
            mesh.scale.set(scale[0], scale[1], scale[2]);
        }
    }

    /**
     * Creates a placeholder geometry for failed mesh loads
     * @returns {THREE.Mesh}
     * @private
     */
    createPlaceholderGeometry() {
        const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
        const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Adds joint axis visualization
     * @param {THREE.Object3D} jointGroup - The joint group to add visualization to
     * @param {Object} jointData - The joint data from URDF
     * @private
     */
    addJointAxisVisualization(jointGroup, jointData) {
        const jointAxis = jointData.axis || [0, 0, 1];
        const axisHelper = new THREE.ArrowHelper(
            new THREE.Vector3(jointAxis[0], jointAxis[1], jointAxis[2]),
            new THREE.Vector3(0, 0, 0),
            0.2,
            0xff0000
        );
        jointGroup.add(axisHelper);
    }

    /**
     * Gets a joint object by name
     * @param {string} jointName - The name of the joint
     * @returns {THREE.Object3D|null}
     */
    getJointObject(jointName) {
        return this.jointObjects.get(jointName) || null;
    }

    /**
     * Gets a link object by name
     * @param {string} linkName - The name of the link
     * @returns {THREE.Object3D|null}
     */
    getLinkObject(linkName) {
        return this.linkObjects.get(linkName) || null;
    }

    /**
     * Gets the robot model
     * @returns {THREE.Group|null}
     */
    getRobotModel() {
        return this.robotModel;
    }
}

class RobotKinematics {
    /**
     * Creates a new RobotKinematics instance
     * @param {Object} robotData - The parsed URDF data
     * @param {string} endEffectorName - The name of the end effector link
     */
    constructor(robotData, endEffectorName) {
        this.robotData = robotData;
        this.endEffectorName = endEffectorName;
        this.jointChain = this.computeJointChain();
    }

    /**
     * Computes the chain of joints from root to end effector
     * @returns {Array} Array of joint chain entries
     * @private
     */
    computeJointChain() {
        const chain = [];
        let currentLink = this.endEffectorName;
        
        while (currentLink) {
            let foundJoint = null;
            let parentLink = null;
            
            for (const [jointName, jointData] of this.robotData.joints) {
                if (jointData.child === currentLink) {
                    foundJoint = jointData;
                    parentLink = jointData.parent;
                    chain.unshift({
                        joint: jointData,
                        childLink: currentLink,
                        parentLink: parentLink
                    });
                    break;
                }
            }
            
            if (!parentLink) break;
            currentLink = parentLink;
        }
        
        return chain;
    }

    /**
     * Calculates forward kinematics for given joint angles
     * @param {Map<string, number>} jointAngles - Map of joint names to angles
     * @param {THREE.Vector3} [rootOffset] - Optional root offset to apply
     * @returns {Object} Object containing position and orientation
     */
    calculateFK(jointAngles, rootOffset = null) {
        // Start with identity matrix at the root
        const result = new THREE.Matrix4();

        // Apply root offset if provided
        if (rootOffset) {
            result.setPosition(rootOffset);
        }

        // Multiply matrices in chain from root to tip
        for (const { joint, childLink } of this.jointChain) {
            // Get joint angle
            const angle = jointAngles.get(joint.name) || 0;
            
            // Create joint transform
            const jointTransform = TransformationUtils.createTransformMatrix(
                joint.origin?.xyz || [0, 0, 0],
                joint.origin?.rpy || [0, 0, 0]
            );

            // Apply joint rotation
            const axis = joint.axis || [0, 0, 1];
            const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
            const rotQuat = new THREE.Quaternion();
            rotQuat.setFromAxisAngle(axisVec, angle);
            const rotMatrix = new THREE.Matrix4();
            rotMatrix.makeRotationFromQuaternion(rotQuat);
            
            // Combine transforms
            result.multiply(jointTransform);
            result.multiply(rotMatrix);

            // Get child link data
            const childLinkData = this.robotData.links.get(childLink);
            
            // Apply visual offset if present
            if (childLinkData?.visual?.origin) {
                const visualTransform = TransformationUtils.createTransformMatrix(
                    childLinkData.visual.origin.xyz || [0, 0, 0],
                    childLinkData.visual.origin.rpy || [0, 0, 0]
                );
                result.multiply(visualTransform);
            }
        }

        // Extract position and orientation
        return TransformationUtils.decomposeTransform(result);
    }

    /**
     * Enforces joint limits on an angle
     * @param {string} jointName - The name of the joint
     * @param {number} angle - The angle to check
     * @returns {number} The limited angle
     */
    enforceJointLimits(jointName, angle) {
        const jointData = this.robotData.joints.get(jointName);
        if (!jointData?.limits) return angle;
        
        const lower = jointData.limits.lower;
        const upper = jointData.limits.upper;
        return Math.max(lower, Math.min(upper, angle));
    }

    /**
     * Generates a random pose within joint limits
     * @param {Map<string, number>} currentAngles - Current joint angles
     * @param {number} perturbationRange - Range of random perturbation in radians
     * @returns {Map<string, number>} New joint angles
     */
    randomizePose(currentAngles, perturbationRange) {
        const newAngles = new Map();
        
        for (const [jointName, jointData] of this.robotData.joints) {
            if (jointData.type !== 'revolute' && jointData.type !== 'prismatic') continue;
            
            const currentAngle = currentAngles.get(jointName) || 0;
            const randomFloat = (Math.random() * 2.0 - 1.0);
            const perturbation = randomFloat * perturbationRange;
            const newAngle = this.enforceJointLimits(jointName, currentAngle + perturbation);
            newAngles.set(jointName, newAngle);
        }
        
        return newAngles;
    }

    /**
     * Gets the joint chain
     * @returns {Array} The joint chain from root to end effector
     */
    getJointChain() {
        return this.jointChain;
    }

    /**
     * Gets the end effector name
     * @returns {string} The end effector name
     */
    getEndEffectorName() {
        return this.endEffectorName;
    }
}

class PerformanceMonitor {
    /**
     * Creates a new PerformanceMonitor instance
     * @param {DebugLogger} logger - The logger instance
     */
    constructor(logger) {
        this.logger = logger;
        this.reset();
    }

    /**
     * Resets all performance counters
     */
    reset() {
        this.frameStartTime = 0;
        this.lastFrameTime = 0;
        this.framePoseCount = 0;
        this.avgTimePerPose = 0;
        this.avgFKTimePerPose = 0;
        this.avgCostTimePerPose = 0;
        this.lastFPS = 0;
        this.frameCount = 0;
        this.lastFPSUpdate = performance.now();
        this.totalFKCalculations = 0;
        this.lastLogTime = Date.now();
    }

    /**
     * Starts timing a new frame
     */
    startFrame() {
        this.frameStartTime = performance.now();
        this.framePoseCount = 0;
        this.fkCalculationTime = 0;
        this.costCalculationTime = 0;
    }

    /**
     * Records a pose calculation
     * @param {number} fkTime - Time spent on FK calculation
     * @param {number} costTime - Time spent on cost calculation
     */
    recordPoseCalculation(fkTime, costTime) {
        this.framePoseCount++;
        this.fkCalculationTime += fkTime;
        this.costCalculationTime += costTime;
        this.totalFKCalculations++;
    }

    /**
     * Updates frame statistics
     */
    updateFrameStats() {
        const now = performance.now();
        const frameTime = now - this.frameStartTime;
        
        // Update averages
        this.avgTimePerPose = this.framePoseCount > 0 ? frameTime / this.framePoseCount : 0;
        this.avgFKTimePerPose = this.framePoseCount > 0 ? this.fkCalculationTime / this.framePoseCount : 0;
        this.avgCostTimePerPose = this.framePoseCount > 0 ? this.costCalculationTime / this.framePoseCount : 0;

        // Update FPS
        this.frameCount++;
        if (now - this.lastFPSUpdate >= 1000) {
            this.lastFPS = Math.round((this.frameCount * 1000) / (now - this.lastFPSUpdate));
            this.frameCount = 0;
            this.lastFPSUpdate = now;
        }
    }

    /**
     * Logs performance statistics if enough time has passed
     * @param {Object} additionalStats - Additional statistics to log
     */
    logStats(additionalStats = {}) {
        const now = Date.now();
        if (now - this.lastLogTime >= 1000) {
            this.logger.info(`Performance Stats:
            Total FK calculations: ${this.totalFKCalculations}
            Frame time: ${(performance.now() - this.frameStartTime).toFixed(2)}ms
            Poses this frame: ${this.framePoseCount}
            Avg time per pose: ${this.avgTimePerPose.toFixed(2)}ms
            FPS: ${this.lastFPS}
            ${Object.entries(additionalStats).map(([key, value]) => `${key}: ${value}`).join('\n            ')}`);

            if (this.avgFKTimePerPose > 0) {
                this.logger.info(`FK Timing Stats:
                Total FK time this frame: ${this.fkCalculationTime.toFixed(2)}ms
                Avg FK time per pose: ${this.avgFKTimePerPose.toFixed(2)}ms
                FK calculations per second: ${(1000 / this.avgFKTimePerPose).toFixed(1)}`);
            }
            
            this.lastLogTime = now;
        }
    }

    /**
     * Gets the current FPS
     * @returns {number}
     */
    getFPS() {
        return this.lastFPS;
    }

    /**
     * Gets performance statistics
     * @returns {Object}
     */
    getStats() {
        return {
            fps: this.lastFPS,
            posesPerFrame: this.framePoseCount,
            avgTimePerPose: this.avgTimePerPose,
            avgFKTimePerPose: this.avgFKTimePerPose,
            avgCostTimePerPose: this.avgCostTimePerPose,
            totalFKCalculations: this.totalFKCalculations
        };
    }
} 