import http.server
import socketserver
import json
import os
import socket

def get_available_models():
    """List URDF files from models directory."""
    models = []
    models_dir = 'public/models'
    
    if not os.path.exists(models_dir):
        os.makedirs(models_dir)
        print(f"Created models directory at {models_dir}")
        return models

    for filename in os.listdir(models_dir):
        if filename.lower().endswith('.urdf'):  # Case-insensitive check
            model_id = os.path.splitext(filename)[0]
            models.append({
                "id": model_id,
                "name": model_id.replace('_', ' ').title(),
                "urdf": filename
            })
    
    print(f"\nFound {len(models)} URDF files in {models_dir}:")
    for model in models:
        print(f"- {model['urdf']}")
    
    return models

class RequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Change to the directory containing this script
        os.chdir(os.path.dirname(os.path.abspath(__file__)))
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/models'):
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.end_headers()
            models = get_available_models()
            self.wfile.write(json.dumps(models).encode())
            return
        else:
            # For all other requests (files, etc)
            try:
                # Send response before headers
                self.send_response(200)
                # Add cache control headers
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.send_header('Pragma', 'no-cache')
                # Let parent class handle the rest
                return super().do_GET()
            except Exception as e:
                self.send_error(404, str(e))

def find_free_port(start_port=8000, max_attempts=100):
    """Find a free port starting from start_port."""
    max_port = start_port + max_attempts
    for port in range(start_port, max_port):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('', port))
                print(f"Found available port: {port}")
                return port
        except OSError:
            if port == start_port:
                print(f"Default port {start_port} is in use, searching for next available port...")
            continue
    raise OSError(f"Could not find a free port between {start_port} and {max_port-1}")

def run_server(port=8000):
    print("\nScanning for URDF models...")
    models = get_available_models()
    
    if not models:
        print("No URDF models found. Place .urdf files in public/models/")
    
    print(f"\nStarting server at http://localhost:{port}")
    print(f"URDF Viewer: http://localhost:{port}/public/urdf_viewer.html")
    
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