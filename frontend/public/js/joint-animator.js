/**
 * Joint Animator
 * A utility class for animating robot joints
 */

class JointAnimator {
    /**
     * Creates a new JointAnimator instance
     * @param {DebugLogger} logger - The logger instance to use for logging
     * @param {URDFReader} urdfReader - The URDF reader instance
     */
    constructor(logger, urdfReader) {
        this.logger = logger || console;
        this.urdfReader = urdfReader;
        this.isAnimating = false;
        this.currentJointIndex = 0;
        this.animationTime = 0;
        this.animationDuration = 3.0; // seconds
        this.jointObjects = new Map();
        this.jointData = new Map();
        this.jointAngles = new Map();
        this.animationCallback = null;
        
        // Verify that the URDFReader has the required methods
        if (this.urdfReader) {
            this.hasValidReader = typeof this.urdfReader.getJointPosition === 'function' && 
                                 typeof this.urdfReader.setJointPosition === 'function' &&
                                 typeof this.urdfReader.getJointLimits === 'function';
            
            if (!this.hasValidReader) {
                this.logger.warning('URDFReader does not have required methods. Joint limits will not be enforced.');
            }
        } else {
            this.hasValidReader = false;
            this.logger.warning('No URDFReader provided. Joint limits will not be enforced.');
        }
    }

    /**
     * Sets the joint objects and data for animation
     * @param {Map} jointObjects - Map of joint names to THREE.Object3D objects
     * @param {Map} jointData - Map of joint names to joint data from URDF
     */
    setJoints(jointObjects, jointData) {
        this.jointObjects = jointObjects || new Map();
        this.jointData = jointData || new Map();
        this.jointAngles = new Map();
        
        // Log the number of joints being set
        this.logger.debug(`Setting ${this.jointObjects.size} joints for animation`, true);
        
        // Initialize joint angles
        for (const jointName of this.jointObjects.keys()) {
            this.jointAngles.set(jointName, 0);
            
            // If we have a valid URDF reader, initialize with the current position from there
            if (this.hasValidReader) {
                try {
                    const position = this.urdfReader.getJointPosition(jointName);
                    if (position !== null) {
                        this.jointAngles.set(jointName, position);
                        this.logger.debug(`Initialized joint ${jointName} to position ${position.toFixed(4)}`);
                    }
                } catch (error) {
                    this.logger.error(`Error getting joint position for ${jointName}: ${error.message}`);
                }
            }
        }
    }

    /**
     * Safely gets a joint position from the URDF reader
     * @param {string} jointName - The name of the joint
     * @returns {number} - The joint position or 0 if not available
     * @private
     */
    _safeGetJointPosition(jointName) {
        if (!this.hasValidReader) return this.jointAngles.get(jointName) || 0;
        
        try {
            const position = this.urdfReader.getJointPosition(jointName);
            return position !== null ? position : (this.jointAngles.get(jointName) || 0);
        } catch (error) {
            this.logger.error(`Error getting joint position for ${jointName}: ${error.message}`);
            return this.jointAngles.get(jointName) || 0;
        }
    }

    /**
     * Safely sets a joint position in the URDF reader
     * @param {string} jointName - The name of the joint
     * @param {number} position - The position to set
     * @returns {number} - The actual position set
     * @private
     */
    _safeSetJointPosition(jointName, position) {
        if (!this.hasValidReader) {
            this.jointAngles.set(jointName, position);
            return position;
        }
        
        try {
            const actualPosition = this.urdfReader.setJointPosition(jointName, position);
            return actualPosition !== null ? actualPosition : position;
        } catch (error) {
            this.logger.error(`Error setting joint position for ${jointName}: ${error.message}`);
            this.jointAngles.set(jointName, position);
            return position;
        }
    }

    /**
     * Safely gets joint limits from the URDF reader
     * @param {string} jointName - The name of the joint
     * @returns {Object|null} - The joint limits or null if not available
     * @private
     */
    _safeGetJointLimits(jointName) {
        if (!this.hasValidReader) {
            const jointData = this.jointData.get(jointName);
            return jointData ? jointData.limit : null;
        }
        
        try {
            return this.urdfReader.getJointLimits(jointName);
        } catch (error) {
            this.logger.error(`Error getting joint limits for ${jointName}: ${error.message}`);
            const jointData = this.jointData.get(jointName);
            return jointData ? jointData.limit : null;
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
        
        // Filter out fixed joints for animation
        const animatableJoints = Array.from(this.jointObjects.keys()).filter(jointName => {
            const jointData = this.jointData.get(jointName);
            return jointData && jointData.type !== 'fixed';
        });
        
        if (animatableJoints.length === 0) {
            this.logger.warning('No movable joints available to animate');
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
        
        // Filter out fixed joints
        const animatableJoints = Array.from(this.jointObjects.keys()).filter(jointName => {
            const jointData = this.jointData.get(jointName);
            return jointData && jointData.type !== 'fixed';
        });
        
        if (animatableJoints.length === 0) {
            this.stopAnimation();
            return null;
        }
        
        const currentJoint = animatableJoints[this.currentJointIndex];
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
            if (this.currentJointIndex >= animatableJoints.length) {
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
        
        // Get joint limits if available
        let lowerLimit = -Math.PI/4;
        let upperLimit = Math.PI/4;
        
        if (jointData.limit) {
            lowerLimit = jointData.limit.lower;
            upperLimit = jointData.limit.upper;
        } else {
            const limits = this._safeGetJointLimits(jointName);
            if (limits) {
                lowerLimit = limits.lower;
                upperLimit = limits.upper;
            }
        }
        
        // Calculate animation range based on joint limits
        const range = upperLimit - lowerLimit;
        const midPoint = (upperLimit + lowerLimit) / 2;
        const amplitude = Math.min(range / 2, Math.PI/4); // Use smaller of range/2 or 45 degrees
        
        if (progress < 0.25) {
            // First quarter: mid to mid+amplitude
            angle = midPoint + (progress * 4) * amplitude;
        } else if (progress < 0.75) {
            // Middle half: mid+amplitude to mid-amplitude
            angle = midPoint + (0.5 - (progress - 0.25) * 2) * 2 * amplitude;
        } else {
            // Last quarter: mid-amplitude to mid
            angle = midPoint + (-1 + (progress - 0.75) * 4) * amplitude;
        }
        
        // Ensure angle is within limits
        angle = Math.max(lowerLimit, Math.min(upperLimit, angle));
        
        // Update the joint angle in the URDF reader if available
        this._safeSetJointPosition(jointName, angle);
        
        // Store the current angle
        this.jointAngles.set(jointName, angle);
        
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
        
        this.logger.info(`Joint ${jointName} angle: ${(angle * 180 / Math.PI).toFixed(2)}° around axis [${axis.join(', ')}] (limits: ${(lowerLimit * 180 / Math.PI).toFixed(2)}° to ${(upperLimit * 180 / Math.PI).toFixed(2)}°)`);
    }

    /**
     * Adjusts a joint angle manually
     * @param {string} jointName - The name of the joint to adjust
     * @param {number} deltaAngle - The angle change in radians
     * @returns {number|null} - The new angle or null if adjustment failed
     */
    adjustJointAngle(jointName, deltaAngle) {
        // Validate inputs
        if (!jointName) {
            this.logger.error("Cannot adjust joint: jointName is undefined or empty");
            return null;
        }
        
        if (typeof deltaAngle !== 'number' || isNaN(deltaAngle)) {
            this.logger.error(`Cannot adjust joint ${jointName}: deltaAngle must be a number, got ${typeof deltaAngle}`);
            return null;
        }
        
        // Check if joint exists
        if (!this.jointObjects.has(jointName)) {
            this.logger.warning(`Joint ${jointName} not found in jointObjects map`);
            return null;
        }
        
        // Stop animation if it's running
        if (this.isAnimating) {
            this.stopAnimation();
        }
        
        // Get joint object and data
        const jointObject = this.jointObjects.get(jointName);
        const jointData = this.jointData.get(jointName);
        
        if (!jointObject) {
            this.logger.warning(`Joint object not found for ${jointName}`);
            return null;
        }
        
        if (!jointData) {
            this.logger.warning(`Joint data not found for ${jointName}`);
            return null;
        }
        
        // Skip fixed joints
        if (jointData.type === 'fixed') {
            this.logger.warning(`Cannot adjust fixed joint ${jointName}`);
            return null;
        }
        
        // Get current angle and update it
        let currentAngle = this.jointAngles.get(jointName) || 0;
        let newAngle = currentAngle + deltaAngle;
        
        this.logger.debug(`Adjusting joint ${jointName} from ${(currentAngle * 180 / Math.PI).toFixed(2)}° to ${(newAngle * 180 / Math.PI).toFixed(2)}° (delta: ${(deltaAngle * 180 / Math.PI).toFixed(2)}°)`, true);
        
        // Apply joint limits
        let originalNewAngle = newAngle;
        if (jointData.limit) {
            newAngle = Math.max(jointData.limit.lower, Math.min(jointData.limit.upper, newAngle));
            
            // Log if the angle was limited
            if (newAngle !== originalNewAngle) {
                this.logger.warning(`Joint ${jointName} angle limited to ${(newAngle * 180 / Math.PI).toFixed(2)}° (limits: ${(jointData.limit.lower * 180 / Math.PI).toFixed(2)}° to ${(jointData.limit.upper * 180 / Math.PI).toFixed(2)}°)`);
            }
        } else {
            // Use URDF reader to apply limits if available
            const actualAngle = this._safeSetJointPosition(jointName, newAngle);
            if (actualAngle !== newAngle) {
                newAngle = actualAngle;
                this.logger.debug(`Joint ${jointName} angle adjusted by URDF reader to ${(newAngle * 180 / Math.PI).toFixed(2)}°`);
            }
        }
        
        // Store the current angle
        this.jointAngles.set(jointName, newAngle);
        
        try {
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
            rotQuat.setFromAxisAngle(axisVec, newAngle);
            
            // Combine with existing rotation
            jointObject.quaternion.multiply(rotQuat);
            
            this.logger.info(`Joint ${jointName} angle adjusted to: ${(newAngle * 180 / Math.PI).toFixed(2)}° around axis [${axis.join(', ')}]`);
        } catch (error) {
            this.logger.error(`Error applying rotation to joint ${jointName}: ${error.message}`);
            // Continue execution - we've already updated the angle in our internal state
        }
        
        return newAngle;
    }

    /**
     * Resets a specific joint to its initial position
     * @param {string} jointName - The name of the joint to reset
     * @param {THREE.Object3D} [jointObject] - The joint object to reset (optional)
     * @param {Object} [jointData] - The joint data from URDF (optional)
     */
    resetJoint(jointName, jointObject, jointData) {
        // If jointObject and jointData are not provided, try to get them from the maps
        if (!jointObject) {
            jointObject = this.jointObjects.get(jointName);
        }
        if (!jointData) {
            jointData = this.jointData.get(jointName);
        }
        
        if (!jointObject || !jointData) {
            this.logger.warning(`Cannot reset joint ${jointName}: object or data not found`);
            return;
        }
        
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
        
        // Reset to middle of range if limits exist
        let resetPosition = 0;
        if (jointData.limit) {
            resetPosition = (jointData.limit.upper + jointData.limit.lower) / 2;
        } else {
            const limits = this._safeGetJointLimits(jointName);
            if (limits) {
                resetPosition = (limits.upper + limits.lower) / 2;
            }
        }
        
        // Update the joint angle in the URDF reader if available
        this._safeSetJointPosition(jointName, resetPosition);
        
        this.jointAngles.set(jointName, resetPosition);
        
        // Apply the reset position to the joint
        const axis = jointData.axis || [0, 0, 1];
        const axisVec = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        const rotQuat = new THREE.Quaternion();
        rotQuat.setFromAxisAngle(axisVec, resetPosition);
        jointObject.quaternion.multiply(rotQuat);
        
        this.logger.info(`Reset joint ${jointName} to ${(resetPosition * 180 / Math.PI).toFixed(2)}°`);
    }

    /**
     * Resets all joint angles to zero or middle of their range
     */
    resetJointAngles() {
        for (const [jointName, angle] of this.jointAngles.entries()) {
            const jointObject = this.jointObjects.get(jointName);
            const jointData = this.jointData.get(jointName);
            
            if (jointObject && jointData) {
                this.resetJoint(jointName, jointObject, jointData);
            }
        }
        
        // If we have a valid URDF reader, use it to reset all joints
        if (this.hasValidReader) {
            try {
                this.urdfReader.resetJointPositions();
            } catch (error) {
                this.logger.error(`Error resetting joint positions: ${error.message}`);
            }
        }
        
        this.logger.info('All joint angles reset');
    }

    /**
     * Gets the current angle of a joint
     * @param {string} jointName - The name of the joint
     * @returns {number} - The current angle in radians
     */
    getJointAngle(jointName) {
        // If we have a valid URDF reader, use it to get the current position
        if (this.hasValidReader) {
            try {
                const position = this.urdfReader.getJointPosition(jointName);
                if (position !== null) {
                    return position;
                }
            } catch (error) {
                this.logger.error(`Error getting joint position for ${jointName}: ${error.message}`);
            }
        }
        
        return this.jointAngles.get(jointName) || 0;
    }

    /**
     * Gets the current animation state
     * @returns {Object} - The current animation state
     */
    getAnimationState() {
        // Filter out fixed joints
        const animatableJoints = Array.from(this.jointObjects.keys()).filter(jointName => {
            const jointData = this.jointData.get(jointName);
            return jointData && jointData.type !== 'fixed';
        });
        
        const currentJoint = animatableJoints[this.currentJointIndex] || '';
        
        return {
            isAnimating: this.isAnimating,
            currentJoint: currentJoint,
            progress: this.animationTime / this.animationDuration,
            jointAngles: Object.fromEntries(this.jointAngles)
        };
    }
} 