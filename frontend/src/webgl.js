let camera, scene, renderer;
let grid;
let isDragging = false;
let previousMousePosition = {
    x: 0,
    y: 0
};

// Camera rotation parameters
let spherical = {
    radius: 10,
    phi: Math.PI / 4,    // vertical angle
    theta: Math.PI / 4   // horizontal angle
};

// Wait for Three.js to load
window.addEventListener('load', () => {
    if (window.THREE) {
        init();
        animate();
    } else {
        console.error('Three.js not loaded');
    }
});

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf3f4f6); // Light gray background

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
    grid = new THREE.GridHelper(20, 20, 0x000000, 0x888888);
    scene.add(grid);

    // Ambient Light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Directional Light
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

    // Initial render
    renderer.render(scene, camera);
}

function updateCameraPosition() {
    // Convert spherical coordinates to Cartesian coordinates
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

    // Update angles
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

    // Update radius (zoom)
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