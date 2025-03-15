/**
 * URDF IK Solver Module
 * Provides inverse kinematics functionality for URDF robot models
 */

class URDFIKSolver {
    constructor(scene, robotModel, urdfReader) {
        this.scene = scene;
        this.robotModel = robotModel;
        this.urdfReader = urdfReader;
        this.endEffectorName = null;
        this.jointObjects = null;
        this.bestDistance = Infinity;
        this.bestJointAngles = new Map();
        this.currentJointAngles = new Map();
        this.totalFKCalculations = 0;
        this.perturbationRange = 10; // Default perturbation range in degrees
        this.viewerMarker = null;
        this.fkMarker = null;
        this.targetPose = null;
        this.fkPoints = null;
        this.showFKPoints = true;
        
        // Performance tracking
        this.lastLogTime = Date.now();
        this.frameStartTime = 0;
        this.framePoseCount = 0;
        
        // Initialize FK visualization points
        this.initFKPoints();
    }

    /**
     * Initialize FK points for visualization
     */
    initFKPoints() {
        const pointGeometry = new THREE.BufferGeometry();
        const pointMaterial = new THREE.PointsMaterial({
            color: 0x00ff00,
            size: 0.01,
            sizeAttenuation: true,
            opacity: 0.6,
            transparent: true
        });
        this.fkPoints = new THREE.Points(pointGeometry, pointMaterial);
        this.scene.add(this.fkPoints);
    }

    /**
     * Set the joint objects map
     * @param {Map} jointObjects - Map of joint names to THREE.js objects
     */
    setJointObjects(jointObjects) {
        this.jointObjects = jointObjects;
    }

    /**
     * Set the end effector name
     * @param {string} endEffectorName - Name of the end effector link
     */
    setEndEffector(endEffectorName) {
        this.endEffectorName = endEffectorName;
    }

    /**
     * Set the target pose for IK
     * @param {THREE.Object3D} targetPose - Target pose object
     */
    setTargetPose(targetPose) {
        this.targetPose = targetPose;
    }

    /**
     * Set the perturbation range for random IK
     * @param {number} degrees - Perturbation range in degrees
     */
    setPerturbationRange(degrees) {
        this.perturbationRange = degrees;
    }

    /**
     * Toggle FK points visibility
     * @param {boolean} visible - Whether FK points should be visible
     */
    setFKPointsVisibility(visible) {
        this.showFKPoints = visible;
        if (this.fkPoints) {
            this.fkPoints.visible = visible;
        }
    }

    /**
     * Clear FK points visualization
     */
    clearFKPoints() {
        if (this.fkPoints) {
            this.fkPoints.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
            this.fkPoints.geometry.setDrawRange(0, 0);
        }
    }

    /**
     * Reset the IK solver state
     */
    reset() {
        this.totalFKCalculations = 0;
        this.lastLogTime = Date.now();
        this.bestDistance = Infinity;
        this.bestJointAngles.clear();
        this.currentJointAngles.clear();
        this.clearFKPoints();
    }

    /**
     * Find an object by name in the scene hierarchy
     * @param {THREE.Object3D} object - Root object to search from
     * @param {string} name - Name to search for
     * @returns {THREE.Object3D|null} - Found object or null
     */
    findObjectByName(object, name) {
        if (object.name === name) return object;
        for (const child of object.children) {
            const found = this.findObjectByName(child, name);
            if (found) return found;
        }
        return null;
    }

    /**
     * Calculate position cost (distance) between end effector and target
     * @param {THREE.Vector3} endEffectorPos - End effector position
     * @returns {number} - Cost value (lower is better)
     */
    calculatePositionCost(endEffectorPos) {
        if (!this.targetPose) return Infinity;
        
        const targetPos = new THREE.Vector3();
        this.targetPose.getWorldPosition(targetPos);
        
        // Calculate position difference
        const positionDistance = endEffectorPos.distanceTo(targetPos);
        
        // Calculate rotation difference
        const endEffectorQuat = new THREE.Quaternion();
        const targetQuat = new THREE.Quaternion();
        
        // Get world quaternions
        this.targetPose.getWorldQuaternion(targetQuat);
        const endEffectorObject = this.findObjectByName(this.robotModel, this.endEffectorName);
        if (endEffectorObject) {
            endEffectorObject.getWorldQuaternion(endEffectorQuat);
        }
        
        // Calculate angle between quaternions (in radians)
        const dotProduct = Math.abs(endEffectorQuat.dot(targetQuat));
        const rotationDistance = Math.acos(Math.min(1, Math.max(-1, 2 * dotProduct * dotProduct - 1)));
        
        // Weight factors for position and rotation
        const positionWeight = 1.0;
        const rotationWeight = 0.5; // Adjust this to change the importance of rotation vs position
        
        // Combined weighted cost
        const totalCost = (positionWeight * positionDistance) + (rotationWeight * rotationDistance);
        
        return totalCost;
    }

    /**
     * Store current joint angles as best solution
     */
    setBestSolution() {
        this.bestJointAngles.clear();
        for (const [jointName, jointData] of this.urdfReader.robot.joints) {
            if (jointData.type === 'revolute' || jointData.type === 'prismatic') {
                this.bestJointAngles.set(jointName, this.currentJointAngles.get(jointName));
            }
        }
    }

    /**
     * Apply the best solution found so far
     */
    applyBestSolution() {
        if (this.bestJointAngles.size === 0) return;
        this.applyConfiguration(this.bestJointAngles);
    }

    /**
     * Apply a joint configuration to the robot
     * @param {Map} jointAngles - Map of joint names to angles
     */
    applyConfiguration(jointAngles) {
        for (const [jointName, angle] of jointAngles) {
            try {
                this.urdfReader.setJointPosition(jointName, angle);
                const jointObject = this.jointObjects.get(jointName);
                if (jointObject) {
                    const jointData = this.urdfReader.robot.joints.get(jointName);
                    
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
            } catch (error) {
                console.error(`Error applying configuration for joint ${jointName}: ${error.message}`);
            }
        }

        // Force update the entire robot's world matrix
        if (this.robotModel) {
            this.robotModel.updateMatrixWorld(true);
        }
    }

    /**
     * Try a random pose for IK solving
     * @param {Function} logger - Logging function for output
     * @param {boolean} showFKComparison - Whether to show FK comparison logs
     * @param {boolean} showFKTiming - Whether to show FK timing logs
     * @returns {Object} - Result of the IK attempt
     */
    randomizePose(logger, showFKComparison = false, showFKTiming = false) {
        if (!this.urdfReader || !this.jointObjects) return null;

        // Track calculations
        this.totalFKCalculations++;
        
        // Store current configuration before trying new one
        const previousAngles = new Map();
        for (const [jointName, jointData] of this.urdfReader.robot.joints) {
            if (jointData.type === 'revolute' || jointData.type === 'prismatic') {
                previousAngles.set(jointName, this.urdfReader.getJointPosition(jointName));
            }
        }

        // Try a random configuration
        const perturbationRadians = (this.perturbationRange * Math.PI) / 180.0;
        
        // Start timing for Three.js FK
        const threejsStartTime = performance.now();
        
        // Apply random configuration using Three.js
        for (const [jointName, jointData] of this.urdfReader.robot.joints) {
            if (jointData.type !== 'revolute' && jointData.type !== 'prismatic') continue;
            
            const currentAngle = previousAngles.get(jointName);
            const randomFloat = (Math.random() * 2.0 - 1.0);
            const perturbation = randomFloat * perturbationRadians;
            let newAngle = currentAngle + perturbation;
            
            if (jointData.limits) {
                const lower = jointData.limits.lower;
                const upper = jointData.limits.upper;
                newAngle = Math.max(lower, Math.min(upper, newAngle));
            }
            
            try {
                this.urdfReader.setJointPosition(jointName, newAngle);
                const jointObject = this.jointObjects.get(jointName);
                if (jointObject) {
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
                    rotQuat.setFromAxisAngle(axisVec, newAngle);
                    jointObject.quaternion.multiply(rotQuat);

                    jointObject.updateMatrix();
                    jointObject.updateMatrixWorld(true);
                }
            } catch (error) {
                if (logger) logger.error(`Error processing joint ${jointName}: ${error.message}`);
            }
        }

        // Update robot's world matrix
        if (this.robotModel) {
            this.robotModel.updateMatrixWorld(true);
        }

        const threejsEndTime = performance.now();
        const threejsTime = threejsEndTime - threejsStartTime;

        // Evaluate new configuration
        if (this.endEffectorName) {
            const endEffectorObject = this.findObjectByName(this.robotModel, this.endEffectorName);
            if (endEffectorObject) {
                // Get viewer's direct world position from Three.js
                const viewerWorldPos = new THREE.Vector3();
                endEffectorObject.getWorldPosition(viewerWorldPos);

                // Get our FK calculation
                const currentAngles = new Map();
                for (const [jointName, jointData] of this.urdfReader.robot.joints) {
                    if (jointData.type === 'revolute' || jointData.type === 'prismatic') {
                        currentAngles.set(jointName, this.urdfReader.getJointPosition(jointName));
                    }
                }

                // Time our FK calculation
                const fkStartTime = performance.now();
                const fkResult = this.calculateFK(currentAngles);
                const fkEndTime = performance.now();
                const fkTime = fkEndTime - fkStartTime;

                // Update visual comparison
                if (fkResult) {
                    this.updateFKComparison(viewerWorldPos, fkResult.position);
                    
                    // Log timing comparison if enabled
                    if (showFKTiming && logger) {
                        const posDiff = viewerWorldPos.distanceTo(fkResult.position);
                        logger.info(`=== FK Method Comparison ===
                        Three.js FK time: ${threejsTime.toFixed(3)}ms
                        Our FK time: ${fkTime.toFixed(3)}ms
                        Position difference: ${posDiff.toFixed(6)}
                        Three.js position: (${viewerWorldPos.x.toFixed(4)}, ${viewerWorldPos.y.toFixed(4)}, ${viewerWorldPos.z.toFixed(4)})
                        Our FK position: (${fkResult.position.x.toFixed(4)}, ${fkResult.position.y.toFixed(4)}, ${fkResult.position.z.toFixed(4)})`);
                    }
                }

                const distance = this.calculatePositionCost(viewerWorldPos);
                
                // Add FK point for visualization
                this.addFKPoint(viewerWorldPos);

                // If new position is better, keep it and update best
                if (distance < this.bestDistance) {
                    this.bestDistance = distance;
                    // Store current configuration as best
                    this.bestJointAngles = new Map();
                    for (const [jointName, jointData] of this.urdfReader.robot.joints) {
                        if (jointData.type === 'revolute' || jointData.type === 'prismatic') {
                            this.bestJointAngles.set(jointName, this.urdfReader.getJointPosition(jointName));
                        }
                    }
                    if (logger) logger.success(`Found better solution! Distance: ${distance.toFixed(4)}`);
                    
                    return {
                        improved: true,
                        distance: distance,
                        threejsTime: threejsTime,
                        fkTime: fkTime,
                        viewerPos: viewerWorldPos,
                        fkPos: fkResult ? fkResult.position : null
                    };
                } else {
                    // Restore previous configuration if not better
                    this.applyConfiguration(previousAngles);
                    
                    return {
                        improved: false,
                        distance: distance,
                        threejsTime: threejsTime,
                        fkTime: fkTime,
                        viewerPos: viewerWorldPos,
                        fkPos: fkResult ? fkResult.position : null
                    };
                }
            }
        }
        
        return {
            improved: false,
            distance: Infinity,
            threejsTime: threejsTime,
            fkTime: 0,
            viewerPos: null,
            fkPos: null
        };
    }

    /**
     * Add a point to the FK visualization
     * @param {THREE.Vector3} position - Position to add
     */
    addFKPoint(position) {
        // Only add points if visualization is enabled
        if (!this.showFKPoints) return;

        const maxPoints = 10000;
        let positions = this.fkPoints.geometry.attributes.position;
        
        if (!positions || positions.count === 0) {
            const newPositions = new Float32Array(maxPoints * 3);
            this.fkPoints.geometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
            positions = this.fkPoints.geometry.attributes.position;
            this.currentPointIndex = 0;
            this.numPoints = 0;
        }

        // Use circular buffer approach
        const idx = this.currentPointIndex * 3;
        positions.array[idx] = position.x;
        positions.array[idx + 1] = position.y;
        positions.array[idx + 2] = position.z;

        // Update current index and count
        this.currentPointIndex = (this.currentPointIndex + 1) % maxPoints;
        this.numPoints = Math.min(this.numPoints + 1, maxPoints);

        positions.needsUpdate = true;
        this.fkPoints.geometry.setDrawRange(0, this.numPoints);
    }

    /**
     * Calculate forward kinematics for a given joint configuration
     * @param {Map} jointAngles - Map of joint names to angles
     * @returns {Object} - Position and orientation result
     */
    calculateFK(jointAngles) {
        // Early exit if no end effector
        if (!this.endEffectorName) return null;

        // Find the chain of joints and links from end effector to root
        const chain = [];
        let currentLink = this.endEffectorName;
        
        while (currentLink) {
            // Find the joint that has this link as its child
            let foundJoint = null;
            let parentLink = null;
            
            for (const [jointName, jointData] of this.urdfReader.robot.joints) {
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

        // Start with identity matrix at the root
        const result = new THREE.Matrix4();

        // Apply root offset if the robot model has one
        if (this.robotModel.position) {
            result.setPosition(this.robotModel.position);
        }

        // Multiply matrices in chain from root to tip
        for (const item of chain) {
            const jointData = item.joint;
            
            // Apply joint origin transform
            if (jointData.origin) {
                const xyz = jointData.origin.xyz || [0, 0, 0];
                const rpy = jointData.origin.rpy || [0, 0, 0];
                const originMatrix = new THREE.Matrix4();
                const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
                const quaternion = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ')
                );
                originMatrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
                result.multiply(originMatrix);
            }

            // Apply joint motion
            if ((jointData.type === 'revolute' || jointData.type === 'prismatic') && jointAngles.has(jointData.name)) {
                const angle = jointAngles.get(jointData.name);
                const axis = jointData.axis || [0, 0, 1];
                const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
                const jointMatrix = new THREE.Matrix4();

                if (jointData.type === 'revolute') {
                    jointMatrix.makeRotationAxis(axisVec, angle);
                } else {
                    jointMatrix.makeTranslation(
                        axisVec.x * angle,
                        axisVec.y * angle,
                        axisVec.z * angle
                    );
                }
                result.multiply(jointMatrix);
            }

            // Get the child link's visual transform if it exists
            const childLinkData = this.urdfReader.robot.links.get(item.childLink);
            if (childLinkData && childLinkData.visual && childLinkData.visual.origin) {
                const xyz = childLinkData.visual.origin.xyz || [0, 0, 0];
                const rpy = childLinkData.visual.origin.rpy || [0, 0, 0];
                const visualMatrix = new THREE.Matrix4();
                const position = new THREE.Vector3(xyz[0], xyz[1], xyz[2]);
                const quaternion = new THREE.Quaternion().setFromEuler(
                    new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ')
                );
                visualMatrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
                result.multiply(visualMatrix);
            }
        }

        // Extract position and orientation
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        result.decompose(position, quaternion, scale);

        return {
            position: position,
            orientation: quaternion
        };
    }

    /**
     * Create a position marker for visualization
     * @param {number} color - Color of the marker
     * @returns {THREE.Mesh} - Marker mesh
     */
    createPositionMarker(color) {
        const geometry = new THREE.SphereGeometry(0.02);
        const material = new THREE.MeshBasicMaterial({ color: color });
        return new THREE.Mesh(geometry, material);
    }

    /**
     * Update the FK comparison visualization
     * @param {THREE.Vector3} viewerWorldPos - Position from Three.js
     * @param {THREE.Vector3} fkPos - Position from our FK calculation
     * @param {Function} logger - Logger function
     * @param {boolean} showFKComparison - Whether to show FK comparison logs
     */
    updateFKComparison(viewerWorldPos, fkPos, logger = null, showFKComparison = false) {
        // Create markers if they don't exist
        if (!this.viewerMarker) {
            this.viewerMarker = this.createPositionMarker(0x00ff00); // Green for viewer
            this.scene.add(this.viewerMarker);
        }
        if (!this.fkMarker) {
            this.fkMarker = this.createPositionMarker(0xff0000); // Red for FK
            this.scene.add(this.fkMarker);
        }

        // Update marker positions
        this.viewerMarker.position.copy(viewerWorldPos);
        this.fkMarker.position.copy(fkPos);

        // Only log if comparison logging is enabled and logger is provided
        if (showFKComparison && logger) {
            const posDiff = viewerWorldPos.distanceTo(fkPos);
            logger.info(`=== FK Comparison ===
            Viewer pos: (${viewerWorldPos.x.toFixed(4)}, ${viewerWorldPos.y.toFixed(4)}, ${viewerWorldPos.z.toFixed(4)})
            FK pos: (${fkPos.x.toFixed(4)}, ${fkPos.y.toFixed(4)}, ${fkPos.z.toFixed(4)})
            Difference: ${posDiff.toFixed(6)}`);
        }
    }
}

// Export the class for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = URDFIKSolver;
} else {
    // For browser use
    window.URDFIKSolver = URDFIKSolver;
} 