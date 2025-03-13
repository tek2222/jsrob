# URDF Robot Viewer

A web-based URDF (Unified Robot Description Format) viewer that allows you to visualize and animate robot models in 3D. This viewer supports both COLLADA (.dae) and STL mesh files.

## Features

- Load and visualize URDF robot models
- Support for both COLLADA (.dae) and STL mesh files
- Interactive 3D viewing with mouse controls:
  - Left-click drag to rotate the view
  - Mouse wheel to zoom in/out
- Joint animation capabilities
- Real-time debug console
- Tree structure visualization of the robot model

## Prerequisites

- Python 3.x
- A modern web browser with WebGL support

## Directory Structure

```
frontend/
├── public/
│   ├── models/
│   │   ├── meshes/      # Place your mesh files (.dae and .stl) here
│   │   └── *.urdf       # Place your URDF files here
│   ├── urdf_viewer.html
│   └── urdfreader.js
└── server.py
```

## Setup

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd <repository-name>
   ```

2. Place your URDF files in the `frontend/public/models/` directory
3. Place corresponding mesh files (.dae and .stl) in the `frontend/public/models/meshes/` directory

## Running the Viewer

1. Start the server:
   ```bash
   python3 frontend/server.py
   ```
   By default, the server runs on port 8000. To use a different port:
   ```bash
   python3 frontend/server.py <port-number>
   ```

2. Open your web browser and navigate to:
   ```
   http://localhost:8000/public/urdf_viewer.html
   ```
   (Replace 8000 with your chosen port number if different)

## Usage

1. Select a robot model from the dropdown menu
2. Click "Load Model" to visualize the robot
3. Use mouse controls to interact with the 3D view:
   - Left-click and drag to rotate the view
   - Mouse wheel to zoom in/out
4. Click "Animate Joints" to see the robot's joints in motion
5. The debug console at the bottom shows loading status and any errors

## File Format Requirements

### URDF Files
- Must be valid URDF XML format
- Should reference mesh files relative to the `/public/models/meshes/` directory
- Example mesh reference in URDF:
  ```xml
  <mesh filename="/public/models/meshes/link1.DAE" />
  ```

### Mesh Files
- Supported formats:
  - COLLADA (.dae)
  - STL (.stl)
- Should be placed in the `frontend/public/models/meshes/` directory
- File names must match the references in the URDF file

## Troubleshooting

- If the server fails to start, check if the port is already in use
- If meshes fail to load, verify that:
  - Mesh files exist in the correct directory
  - File paths in the URDF file are correct
  - File names match exactly (case-sensitive)
- Check the debug console in the viewer for detailed error messages

## Example

The repository includes a sample KUKA robot model (`kuka.urdf`) with corresponding mesh files for testing.
