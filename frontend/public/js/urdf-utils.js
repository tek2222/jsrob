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