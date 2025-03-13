/**
 * Mesh Loader
 * A utility class for loading and processing 3D mesh files (STL, DAE)
 */

class MeshLoader {
    /**
     * Creates a new MeshLoader instance
     * @param {DebugLogger} logger - The logger instance to use for logging
     */
    constructor(logger) {
        this.logger = logger || console;
        this.stlLoader = new THREE.STLLoader();
        this.colladaLoader = new THREE.ColladaLoader();
        
        // Set ColladaLoader options
        if (this.colladaLoader) {
            this.colladaLoader.options = { convertUpAxis: true };
        }
    }

    /**
     * Loads a mesh file and returns a promise that resolves to a THREE.Object3D
     * @param {string} filename - The name of the mesh file to load
     * @param {string} basePath - The base path to the mesh files
     * @returns {Promise<THREE.Object3D>} - A promise that resolves to the loaded mesh
     */
    loadMesh(filename, basePath = '/public/models/meshes/') {
        return new Promise((resolve, reject) => {
            // Create a placeholder mesh in case loading fails
            const placeholder = new THREE.BoxGeometry(0.1, 0.1, 0.1);
            const material = new THREE.MeshPhongMaterial({ color: 0x808080 });
            const mesh = new THREE.Mesh(placeholder, material);

            const meshPath = `${basePath}${filename}`;
            const timestamp = new Date().getTime();
            this.logger.info(`Loading mesh file: ${filename}`);
            this.logger.info(`Resolved path: ${meshPath}`);

            if (filename.toLowerCase().endsWith('.stl')) {
                this.loadSTL(meshPath, timestamp, mesh, resolve, reject);
            } else if (filename.toLowerCase().endsWith('.dae')) {
                this.loadDAE(meshPath, timestamp, resolve, reject);
            } else {
                reject(new Error(`Unsupported file format: ${filename}`));
            }
        });
    }

    /**
     * Loads an STL file
     * @private
     * @param {string} path - The path to the STL file
     * @param {number} timestamp - The timestamp to append to the URL
     * @param {THREE.Mesh} mesh - The mesh to update with the loaded geometry
     * @param {Function} resolve - The promise resolve function
     * @param {Function} reject - The promise reject function
     */
    loadSTL(path, timestamp, mesh, resolve, reject) {
        this.stlLoader.load(
            `${path}?t=${timestamp}`,
            (geometry) => {
                geometry.computeBoundingBox();
                const center = new THREE.Vector3();
                geometry.boundingBox.getCenter(center);
                geometry.center();
                
                // Fix for STL files - ensure proper orientation and scale
                // STL files often use a different coordinate system than URDF expects
                mesh.geometry = geometry;
                
                // Apply a rotation to correct the orientation
                // This rotates from STL's coordinate system to match the URDF/DAE coordinate system
                mesh.rotation.set(-Math.PI/2, 0, 0);
                
                mesh.material = new THREE.MeshPhongMaterial({ 
                    color: 0x808080,
                    shininess: 30,
                    specular: 0x111111
                });
                
                this.logger.success(`Successfully loaded STL: ${path} with coordinate system correction`);
                resolve(mesh);
            },
            (progress) => {
                if (progress.lengthComputable) {
                    const percentComplete = (progress.loaded / progress.total) * 100;
                    this.logger.info(`Loading ${path}: ${Math.round(percentComplete)}%`);
                }
            },
            (error) => {
                this.logger.error(`Failed to load STL: ${path}`);
                this.logger.error(`Error details: ${error.message}`);
                reject(error);
            }
        );
    }

    /**
     * Loads a DAE (Collada) file
     * @private
     * @param {string} path - The path to the DAE file
     * @param {number} timestamp - The timestamp to append to the URL
     * @param {Function} resolve - The promise resolve function
     * @param {Function} reject - The promise reject function
     */
    loadDAE(path, timestamp, resolve, reject) {
        this.colladaLoader.load(
            `${path}?t=${timestamp}`,
            (collada) => {
                try {
                    const daeScene = collada.scene;
                    this.logger.info(`DAE scene loaded for ${path}`);
                    
                    // Apply materials and process meshes
                    daeScene.traverse((child) => {
                        if (child instanceof THREE.Mesh) {
                            child.material = new THREE.MeshPhongMaterial({ 
                                color: 0x808080,
                                shininess: 30,
                                specular: 0x111111
                            });
                            // Ensure geometry is properly initialized
                            if (child.geometry) {
                                child.geometry.computeBoundingBox();
                                child.geometry.computeVertexNormals();
                            }
                        }
                    });
                    
                    // Center the model
                    const box = new THREE.Box3().setFromObject(daeScene);
                    const center = box.getCenter(new THREE.Vector3());
                    daeScene.position.sub(center);
                    
                    this.logger.success(`Successfully loaded DAE: ${path}`);
                    resolve(daeScene);
                } catch (error) {
                    this.logger.error(`Error processing DAE scene for ${path}: ${error.message}`);
                    reject(error);
                }
            },
            (progress) => {
                if (progress.lengthComputable) {
                    const percentComplete = (progress.loaded / progress.total) * 100;
                    this.logger.info(`Loading ${path}: ${Math.round(percentComplete)}%`);
                }
            },
            (error) => {
                this.logger.error(`Failed to load DAE: ${path}`);
                this.logger.error(`Error details: ${error.message}`);
                reject(error);
            }
        );
    }

    /**
     * Applies transformations to a mesh based on URDF visual data
     * @param {THREE.Object3D} mesh - The mesh to transform
     * @param {Object} visualData - The URDF visual data
     * @param {string} filename - The mesh filename
     */
    applyTransformations(mesh, visualData, filename) {
        if (visualData.origin) {
            const xyz = visualData.origin.xyz || [0, 0, 0];
            const rpy = visualData.origin.rpy || [0, 0, 0];
            
            // For STL files, we need to handle the orientation differently
            if (filename.toLowerCase().endsWith('.stl')) {
                // The rotation was already applied in loadMesh for STLs
                // Just apply the position and any additional rotation from URDF
                mesh.position.set(xyz[0], xyz[1], xyz[2]);
                
                // Create a rotation matrix from the URDF RPY values
                const euler = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
                const quaternion = new THREE.Quaternion().setFromEuler(euler);
                
                // Combine with the existing rotation (which corrects the coordinate system)
                mesh.quaternion.premultiply(quaternion);
            } else {
                // For DAE files, apply transform normally
                mesh.position.set(xyz[0], xyz[1], xyz[2]);
                mesh.rotation.set(rpy[0], rpy[1], rpy[2]);
            }
        }

        if (visualData.geometry && visualData.geometry.scale) {
            const scale = visualData.geometry.scale;
            mesh.scale.set(scale[0], scale[1], scale[2]);
        }
    }
} 