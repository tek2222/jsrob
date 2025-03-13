import os
import http.server
import socketserver
import json

def get_available_models(file_type='urdf'):
    models = []
    base_dir = os.path.dirname(os.path.abspath(__file__))
    models_dir = os.path.join(base_dir, 'public', 'models')
    
    print(f"Searching for {file_type} files in: {models_dir}")
    
    # Create models directory if it doesn't exist
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)
        print(f"Created {models_dir} directory")
    
    try:
        for root, dirs, files in os.walk(models_dir):
            print(f"Scanning directory: {root}")
            print(f"Found files: {files}")
            for filename in files:
                if filename.lower().endswith(f'.{file_type.lower()}'):
                    # Get relative path from models directory
                    rel_path = os.path.relpath(os.path.join(root, filename), models_dir)
                    print(f"Found {file_type} file: {rel_path}")
                    # For URDF files, we want to keep them in the root models directory
                    if file_type.lower() == 'urdf':
                        models.append({
                            'name': os.path.splitext(filename)[0],  # Remove .urdf extension
                            'urdf': filename  # Just use the filename for URDF files
                        })
                    else:
                        models.append({
                            'name': filename,
                            'urdf': rel_path  # Store the relative path for mesh files
                        })
        print(f"Total {file_type} files found: {len(models)}")
        return models
    except Exception as e:
        print(f"Error reading models directory: {e}")
        return []

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Change to the directory containing this script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        os.chdir(script_dir)
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/models'):
            print(f"\nHandling API request: {self.path}")
            # Add CORS headers
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            
            # Check if we're looking for STL files
            if 'stl=true' in self.path:
                print("Requesting STL files")
                models = get_available_models('stl')
            else:
                print("Requesting URDF files")
                models = get_available_models('urdf')
                print(f"Found URDF models: {json.dumps(models, indent=2)}")
            
            response = json.dumps(models)
            print(f"Sending response: {response}")
            self.wfile.write(response.encode())
            return
        elif self.path == '/':
            # Redirect root to URDF viewer
            self.send_response(302)
            self.send_header('Location', '/public/urdf_viewer.html')
            self.end_headers()
            return
        else:
            # For all other requests (files, etc)
            try:
                # Remove query parameters for file serving
                clean_path = self.path.split('?')[0]
                self.path = clean_path
                print(f"Serving file: {self.path}")
                
                # Special handling for mesh files
                if '/meshes/' in clean_path:
                    # Keep the meshes path as is, don't adjust it
                    print(f"Serving mesh file from: {self.path}")
                
                return super().do_GET()
            except Exception as e:
                print(f"Error serving file: {self.path}")
                print(f"Error details: {str(e)}")
                self.send_error(404, str(e))

def run_server(port=8000):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    # Create meshes directory if it doesn't exist
    meshes_dir = os.path.join(base_dir, 'public', 'models', 'meshes')
    if not os.path.exists(meshes_dir):
        os.makedirs(meshes_dir)
        print(f"Created {meshes_dir} directory")

    # List available URDF files
    print("\nScanning for URDF files...")
    urdf_models = get_available_models('urdf')
    
    if urdf_models:
        print(f"\nFound {len(urdf_models)} URDF files in public/models:")
        for model in urdf_models:
            print(f"- {model['name']}")
    else:
        print("\nNo URDF files found. Place .urdf files in public/models/")

    # List available mesh files
    print("\nScanning for mesh files...")
    stl_models = get_available_models('stl')
    dae_models = get_available_models('dae')
    
    if stl_models:
        print(f"\nFound {len(stl_models)} STL files:")
        for model in stl_models:
            print(f"- {model['urdf']}")
    
    if dae_models:
        print(f"\nFound {len(dae_models)} DAE files:")
        for model in dae_models:
            print(f"- {model['urdf']}")
    
    if not (stl_models or dae_models):
        print("\nNo mesh files found. Place .stl or .dae files in public/models/meshes/")
    
    print(f"\nStarting server at http://localhost:{port}")
    print(f"URDF Viewer: http://localhost:{port}/public/urdf_viewer.html")
    print(f"STL Viewer: http://localhost:{port}/public/stl_viewer.html")
    
    with socketserver.TCPServer(("", port), RequestHandler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            httpd.shutdown()

if __name__ == "__main__":
    import sys
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    run_server(port) 