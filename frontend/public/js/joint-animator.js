/**
 * Joint Animator
 * A utility class for animating robot joints
 */

class JointAnimator {
    /**
     * Creates a new JointAnimator instance
     * @param {DebugLogger} logger - The logger instance to use for logging
     */
    constructor(logger) {
        this.logger = logger || console;
        this.isAnimating = false;
        this.currentJointIndex = 0;
        this.animationTime = 0;
        this.animationDuration = 3.0; // seconds
        this.jointObjects = new Map();
        this.jointData = new Map();
        this.jointAngles = new Map();
        this.animationCallback = null;
    }

    /**
     * Sets the joint objects and data for animation
     * @param {Map} jointObjects - Map of joint names to THREE.Object3D objects
     * @param {Map} jointData - Map of joint names to joint data from URDF
     */
    setJoints(jointObjects, jointData) {
        this.jointObjects = jointObjects;
        this.jointData = jointData;
        this.jointAngles = new Map();
        
        // Initialize joint angles
        for (const jointName of this.jointObjects.keys()) {
            this.jointAngles.set(jointName, 0);
        }
    }

    /**
     * Starts the animation
     * @param {Function} callback - Callback function to call on each animation frame
     * @returns {boolean} - Whether the animation was started successfully
     */
    startAnimation(callback) {
        if (!this.jointObjects || this.jointObjects.size === 0) {
            this.logger.warning('No joints available to animate');
            return false;
        }
        
        this.isAnimating = true;
        this.currentJointIndex = 0;
        this.animationTime = 0;
        this.animationCallback = callback;
        this.logger.info('Starting joint animation');
        return true;
    }

    /**
     * Stops the animation
     */
    stopAnimation() {
        this.isAnimating = false;
        this.resetJointAngles();
        this.logger.info('Animation stopped');
    }

    /**
     * Updates the animation state
     * @param {number} deltaTime - The time elapsed since the last update in seconds
     * @returns {Object} - The current animation state
     */
    update(deltaTime = 0.016) {
        if (!this.isAnimating) return null;

        this.animationTime += deltaTime;
        
        const jointNames = Array.from(this.jointObjects.keys());
        const currentJoint = jointNames[this.currentJointIndex];
        const jointObject = this.jointObjects.get(currentJoint);
        const jointData = this.jointData.get(currentJoint);
        
        if (jointObject && jointData) {
            this.animateJoint(currentJoint, jointObject, jointData);
        }
        
        // Check if we need to move to the next joint
        if (this.animationTime >= this.animationDuration) {
            this.animationTime = 0;
            this.currentJointIndex++;
            
            // Reset current joint to initial position
            if (jointObject && jointData) {
                this.resetJoint(currentJoint, jointObject, jointData);
            }
            
            // Cycle back to the first joint if we've animated all joints
            if (this.currentJointIndex >= this.jointObjects.size) {
                this.currentJointIndex = 0;
            }
        }
        
        // Call the animation callback if provided
        if (this.animationCallback) {
            this.animationCallback({
                isAnimating: this.isAnimating,
                currentJoint: currentJoint,
                progress: this.animationTime / this.animationDuration
            });
        }
        
        return {
            isAnimating: this.isAnimating,
            currentJoint: currentJoint,
            progress: this.animationTime / this.animationDuration
        };
    }

    /**
     * Animates a specific joint
     * @private
     * @param {string} jointName - The name of the joint to animate
     * @param {THREE.Object3D} jointObject - The joint object to animate
     * @param {Object} jointData - The joint data from URDF
     */
    animateJoint(jointName, jointObject, jointData) {
        // Calculate angle based on time
        const progress = this.animationTime / this.animationDuration;
        let angle;
        
        if (progress < 0.25) {
            // First quarter: 0 to +45 degrees
            angle = (progress * 4) * Math.PI / 4;
        } else if (progress < 0.75) {
            // Middle half: +45 to -45 degrees
            angle = ((0.5 - (progress - 0.25) * 2) * Math.PI / 2);
        } else {
            // Last quarter: -45 to 0 degrees
            angle = (-1 + (progress - 0.75) * 4) * Math.PI / 4;
        }
        
        // Get the joint's axis of rotation
        const axis = jointData.axis || [0, 0, 1];
        
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
        const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        const rotQuat = new THREE.Quaternion();
        rotQuat.setFromAxisAngle(axisVec, angle);
        
        // Combine with existing rotation
        jointObject.quaternion.multiply(rotQuat);
        
        this.logger.info(`Joint ${jointName} angle: ${(angle * 180 / Math.PI).toFixed(2)}° around axis [${axis.join(', ')}]`);
    }

    /**
     * Adjusts a joint angle manually
     * @param {string} jointName - The name of the joint to adjust
     * @param {number} deltaAngle - The angle change in radians
     */
    adjustJointAngle(jointName, deltaAngle) {
        if (!this.jointObjects.has(jointName)) {
            this.logger.warning(`Joint ${jointName} not found`);
            return;
        }
        
        // Stop animation if it's running
        if (this.isAnimating) {
            this.stopAnimation();
        }
        
        const jointObject = this.jointObjects.get(jointName);
        const jointData = this.jointData.get(jointName);
        
        if (!jointObject || !jointData) {
            this.logger.warning(`Joint data not found for ${jointName}`);
            return;
        }
        
        // Get current angle and update it
        let currentAngle = this.jointAngles.get(jointName) || 0;
        currentAngle += deltaAngle;
        this.jointAngles.set(jointName, currentAngle);
        
        // Get the joint's axis of rotation
        const axis = jointData.axis || [0, 0, 1];
        
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
        const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        const rotQuat = new THREE.Quaternion();
        rotQuat.setFromAxisAngle(axisVec, currentAngle);
        
        // Combine with existing rotation
        jointObject.quaternion.multiply(rotQuat);
        
        this.logger.info(`Joint ${jointName} angle adjusted to: ${(currentAngle * 180 / Math.PI).toFixed(2)}° around axis [${axis.join(', ')}]`);
        
        return currentAngle;
    }

    /**
     * Resets a specific joint to its initial position
     * @private
     * @param {string} jointName - The name of the joint to reset
     * @param {THREE.Object3D} jointObject - The joint object to reset
     * @param {Object} jointData - The joint data from URDF
     */
    resetJoint(jointName, jointObject, jointData) {
        jointObject.position.set(0, 0, 0);
        jointObject.quaternion.set(0, 0, 0, 1);
        jointObject.scale.set(1, 1, 1);
        
        if (jointData.origin) {
            const xyz = jointData.origin.xyz || [0, 0, 0];
            const rpy = jointData.origin.rpy || [0, 0, 0];
            
            jointObject.position.set(xyz[0], xyz[1], xyz[2]);
            const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
            jointObject.setRotationFromEuler(euler);
        }
        
        this.jointAngles.set(jointName, 0);
    }

    /**
     * Resets all joint angles to zero
     */
    resetJointAngles() {
        for (const [jointName, angle] of this.jointAngles.entries()) {
            if (angle !== 0) {
                const jointObject = this.jointObjects.get(jointName);
                const jointData = this.jointData.get(jointName);
                
                if (jointObject && jointData) {
                    this.resetJoint(jointName, jointObject, jointData);
                }
            }
        }
        
        this.logger.info('All joint angles reset to zero');
    }

    /**
     * Gets the current angle of a joint
     * @param {string} jointName - The name of the joint
     * @returns {number} - The current angle in radians
     */
    getJointAngle(jointName) {
        return this.jointAngles.get(jointName) || 0;
    }

    /**
     * Gets the current animation state
     * @returns {Object} - The current animation state
     */
    getAnimationState() {
        const jointNames = Array.from(this.jointObjects.keys());
        const currentJoint = jointNames[this.currentJointIndex];
        
        return {
            isAnimating: this.isAnimating,
            currentJoint: currentJoint,
            progress: this.animationTime / this.animationDuration,
            jointAngles: Object.fromEntries(this.jointAngles)
        };
    }
} 