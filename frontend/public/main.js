const API_URL = 'http://localhost:8000';

// Get DOM elements
const itemForm = document.getElementById('itemForm');
const itemsList = document.getElementById('itemsList');

// Fetch all items
async function fetchItems() {
    try {
        const response = await fetch(`${API_URL}/items`);
        const items = await response.json();
        displayItems(items);
    } catch (error) {
        console.error('Error fetching items:', error);
    }
}

// Display items in the UI
function displayItems(items) {
    itemsList.innerHTML = '';
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'bg-white rounded-lg shadow-md p-4';
        itemElement.innerHTML = `
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="text-lg font-semibold">${item.name}</h3>
                    <p class="text-gray-600">${item.description || 'No description'}</p>
                    <p class="text-sm text-gray-500">ID: ${item.id}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <input type="checkbox" ${item.completed ? 'checked' : ''} 
                           onchange="updateItem(${item.id}, this.checked)"
                           class="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded">
                    <button onclick="deleteItem(${item.id})"
                            class="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600">
                        Delete
                    </button>
                </div>
            </div>
        `;
        itemsList.appendChild(itemElement);
    });
}

// Add new item
itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newItem = {
        id: parseInt(document.getElementById('itemId').value),
        name: document.getElementById('itemName').value,
        description: document.getElementById('itemDescription').value,
        completed: document.getElementById('itemCompleted').checked
    };

    try {
        const response = await fetch(`${API_URL}/items`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(newItem)
        });

        if (response.ok) {
            itemForm.reset();
            fetchItems();
        }
    } catch (error) {
        console.error('Error adding item:', error);
    }
});

// Update item
window.updateItem = async (id, completed) => {
    try {
        const response = await fetch(`${API_URL}/items/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id,
                completed
            })
        });

        if (response.ok) {
            fetchItems();
        }
    } catch (error) {
        console.error('Error updating item:', error);
    }
};

// Delete item
window.deleteItem = async (id) => {
    try {
        const response = await fetch(`${API_URL}/items/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fetchItems();
        }
    } catch (error) {
        console.error('Error deleting item:', error);
    }
};

// Initial fetch
fetchItems();
