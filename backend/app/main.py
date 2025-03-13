from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from typing import List, Optional
from dataclasses import dataclass, asdict
import urllib.parse

@dataclass
class Item:
    id: int
    name: str
    description: Optional[str] = None
    completed: bool = False

# In-memory storage
items: List[Item] = []

class RequestHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status_code=200):
        self.send_response(status_code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', '*')
        self.send_header('Access-Control-Allow-Headers', '*')
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        if self.path == '/items':
            self._set_headers()
            response = json.dumps([asdict(item) for item in items])
            self.wfile.write(response.encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())

    def do_POST(self):
        if self.path == '/items':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            item_data = json.loads(post_data.decode())
            
            new_item = Item(
                id=item_data['id'],
                name=item_data['name'],
                description=item_data.get('description'),
                completed=item_data.get('completed', False)
            )
            items.append(new_item)
            
            self._set_headers()
            self.wfile.write(json.dumps(asdict(new_item)).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())

    def do_PUT(self):
        if self.path.startswith('/items/'):
            try:
                item_id = int(self.path.split('/')[-1])
                content_length = int(self.headers['Content-Length'])
                put_data = self.rfile.read(content_length)
                item_data = json.loads(put_data.decode())

                for i, item in enumerate(items):
                    if item.id == item_id:
                        updated_item = Item(
                            id=item_id,
                            name=item_data.get('name', item.name),
                            description=item_data.get('description', item.description),
                            completed=item_data.get('completed', item.completed)
                        )
                        items[i] = updated_item
                        self._set_headers()
                        self.wfile.write(json.dumps(asdict(updated_item)).encode())
                        return

                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Item not found"}).encode())
            except:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid request"}).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())

    def do_DELETE(self):
        if self.path.startswith('/items/'):
            try:
                item_id = int(self.path.split('/')[-1])
                for i, item in enumerate(items):
                    if item.id == item_id:
                        deleted_item = items.pop(i)
                        self._set_headers()
                        self.wfile.write(json.dumps(asdict(deleted_item)).encode())
                        return

                self._set_headers(404)
                self.wfile.write(json.dumps({"error": "Item not found"}).encode())
            except:
                self._set_headers(400)
                self.wfile.write(json.dumps({"error": "Invalid request"}).encode())
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Not found"}).encode())

def run(server_class=HTTPServer, handler_class=RequestHandler, port=8000):
    server_address = ('', port)
    httpd = server_class(server_address, handler_class)
    print(f"Starting server on port {port}...")
    httpd.serve_forever()

if __name__ == '__main__':
    run()
