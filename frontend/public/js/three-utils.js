/**
 * Three.js Utilities
 * A collection of reusable utility functions for Three.js applications
 */

class ThreeUtils {
    /**
     * Loads a script dynamically and returns a promise
     * @param {string} src - The source URL of the script to load
     * @returns {Promise} - A promise that resolves when the script is loaded
     */
    static loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    /**
     * Creates a standard grid helper for visualization
     * @param {number} size - The size of the grid
     * @param {number} divisions - The number of divisions in the grid
     * @param {number} centerColor - The color of the center lines
     * @param {number} gridColor - The color of the grid lines
     * @returns {THREE.GridHelper} - The created grid helper
     */
    static createGrid(size = 10, divisions = 10, centerColor = 0x444444, gridColor = 0x888888) {
        const grid = new THREE.GridHelper(size, divisions, centerColor, gridColor);
        grid.rotation.x = Math.PI / 2; // Rotate to lie on XY plane (for Z-up coordinate system)
        return grid;
    }

    /**
     * Creates standard lighting for a scene
     * @param {THREE.Scene} scene - The scene to add lights to
     */
    static setupLighting(scene) {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);
    }

    /**
     * Calculates camera position based on spherical coordinates
     * @param {Object} spherical - Object containing radius, phi, and theta
     * @returns {THREE.Vector3} - The calculated camera position
     */
    static calculateCameraPosition(spherical) {
        return new THREE.Vector3(
            spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
            spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
            spherical.radius * Math.cos(spherical.phi)
        );
    }

    /**
     * Creates a standard material for meshes
     * @param {number} color - The color of the material
     * @returns {THREE.MeshPhongMaterial} - The created material
     */
    static createStandardMaterial(color = 0x808080) {
        return new THREE.MeshPhongMaterial({ 
            color: color,
            shininess: 30,
            specular: 0x111111
        });
    }

    /**
     * Centers a mesh based on its bounding box
     * @param {THREE.Object3D} object - The object to center
     */
    static centerObject(object) {
        const box = new THREE.Box3().setFromObject(object);
        const center = box.getCenter(new THREE.Vector3());
        object.position.sub(center);
    }

    /**
     * Creates a quaternion from an axis and angle
     * @param {Array} axis - The axis as [x, y, z]
     * @param {number} angle - The angle in radians
     * @returns {THREE.Quaternion} - The created quaternion
     */
    static createRotationFromAxisAngle(axis, angle) {
        const axisVector = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        const quaternion = new THREE.Quaternion();
        quaternion.setFromAxisAngle(axisVector, angle);
        return quaternion;
    }

    /**
     * Creates a quaternion from Euler angles
     * @param {Array} rpy - The roll, pitch, yaw angles as [r, p, y]
     * @returns {THREE.Quaternion} - The created quaternion
     */
    static createQuaternionFromRPY(rpy) {
        const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
        return new THREE.Quaternion().setFromEuler(euler);
    }
} 