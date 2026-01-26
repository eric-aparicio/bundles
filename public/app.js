// State
let selectedComponents = [];
let editMode = false;
let editingBundleId = null;
let currentPage = 1;
const PRODUCTS_PER_PAGE = 250;

// Load bundles on page load
document.addEventListener('DOMContentLoaded', () => {
  loadBundles();
});

// Load all bundles
async function loadBundles() {
  try {
    const response = await fetch('/api/bundles');
    const data = await response.json();
    
    if (data.success) {
      displayBundles(data.bundles);
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError('Error al cargar bundles');
    console.error(error);
  }
}

// Display bundles
function displayBundles(bundles) {
  const container = document.getElementById('bundles-container');
  const emptyState = document.getElementById('empty-state');
  
  // Update stats
  document.getElementById('total-bundles').textContent = bundles.length;
  let totalComponents = bundles.reduce((sum, b) => sum + (b.config?.components?.length || 0), 0);
  document.getElementById('total-components').textContent = totalComponents;
  
  if (bundles.length === 0) {
    container.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  container.style.display = 'grid';
  emptyState.style.display = 'none';
  
  container.innerHTML = bundles.map(bundle => `
    <div class="bundle-card">
      <div class="bundle-checkbox">
        <input type="checkbox" onclick="toggleBundleSelection('${bundle.id}', this)">
      </div>
      ${bundle.image ? `<img src="${bundle.image}" alt="${bundle.title}">` : ''}
      <h3 class="bundle-title">${bundle.title}</h3>
      <div class="bundle-info">
        <strong>Precio Bundle:</strong> ${bundle.price || 'N/A'}€<br>
        ${(() => {
          const componentsTotal = (bundle.config?.components || []).reduce((sum, c) => {
            return sum + (parseFloat(c.price || 0) * (c.quantity || 1));
          }, 0);
          const savings = componentsTotal - parseFloat(bundle.price || 0);
          const savingsPercent = componentsTotal > 0 ? ((savings / componentsTotal) * 100).toFixed(1) : 0;
          return savings > 0 
            ? `<strong style="color: var(--success)">Ahorro: ${savings.toFixed(2)}€ (${savingsPercent}%)</strong><br>` 
            : '';
        })()}
        <strong>Inventario:</strong> ${bundle.inventoryQuantity || 0} unidades
      </div>
      <div class="bundle-components">
        <strong>Componentes (${bundle.config?.components?.length || 0})</strong>
        ${(bundle.config?.components || []).map(c => `
          <div class="component-item">
            <span>${c.product_title} (x${c.quantity}) - ${c.price}€</span>
          </div>
        `).join('')}
      </div>
      <div class="bundle-actions">
        <button class="btn btn-primary" onclick="editBundle('${bundle.id}')">✏️ Editar</button>
        <button class="btn btn-secondary" onclick="duplicateBundle('${bundle.id}')">📋 Duplicar</button>
        <button class="btn btn-danger" onclick="deleteBundle('${bundle.id}')">🗑️ Eliminar</button>
      </div>
    </div>
  `).join('');
}

// Delete bundle
async function deleteBundle(bundleId) {
  const result = await Swal.fire({
    title: '¿Eliminar bundle?',
    text: 'Se eliminará el producto de Shopify permanentemente',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#EF4444',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  
  if (!result.isConfirmed) return;
  
  try {
    const response = await fetch('/api/bundles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bundleId })
    });
    
    const data = await response.json();
    
    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Eliminado',
        text: 'Bundle eliminado correctamente',
        timer: 2000
      });
      loadBundles();
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError('Error al eliminar bundle');
  }
}

// Open create modal
function openCreateModal() {
  document.getElementById('createModal').style.display = 'block';
  goToStep(1);
  // Clear form
  document.getElementById('bundle-name').value = '';
  document.getElementById('bundle-price').value = '';
}

// Close create modal
function closeCreateModal() {
  document.getElementById('createModal').style.display = 'none';
  selectedComponents = [];
  editMode = false;
  editingBundleId = null;
  
  // Reset button
  const createBtn = document.querySelector('.modal-actions button.btn-primary');
  if (createBtn) {
    createBtn.textContent = '✓ Crear Bundle';
    createBtn.onclick = createBundle;
  }
}

// Navigate between steps
function goToStep(step) {
  document.getElementById('step1').style.display = step === 1 ? 'block' : 'none';
  document.getElementById('step2').style.display = step === 2 ? 'block' : 'none';
  
  // Load products when entering step 2
  if (step === 2) {
    searchComponentProducts();
  }
}

// Display component products
function displayComponentProducts(products) {
  const grid = document.getElementById('component-products-grid');
  
  grid.innerHTML = products.map(product => {
    // Create selectable variants if product has multiple
    if (product.variants && product.variants.length > 1) {
      return product.variants.map(variant => `
        <div class="product-card" onclick='addComponent(${JSON.stringify({
          variant_id: variant.id,
          product_title: `${product.title} - ${variant.title}`,
          price: variant.price
        }).replace(/'/g, "\\'")})'>
          ${product.image ? 
            `<img src="${product.image}" alt="${product.title}">` : 
            ''}
          <div class="product-card-title">${product.title}</div>
          <div class="product-card-price">${variant.title}: ${variant.price}€</div>
        </div>
      `).join('');
    } else {
      // Single variant product
      const variant = product.variants?.[0];
      return `
        <div class="product-card" onclick='addComponent(${JSON.stringify({
          variant_id: variant?.id || product.id,
          product_title: product.title,
          price: variant?.price || '0'
        }).replace(/'/g, "\\'")})'>
          ${product.image ? 
            `<img src="${product.image}" alt="${product.title}">` : 
            ''}
          <div class="product-card-title">${product.title}</div>
          ${variant ? `<div class="product-card-price">${variant.price}€</div>` : ''}
        </div>
      `;
    }
  }).join('');
}

// Add component
function addComponent(component) {
  // Check if already added
  const exists = selectedComponents.find(c => c.variant_id === component.variant_id);
  if (exists) {
    exists.quantity++;
  } else {
    selectedComponents.push({ ...component, quantity: 1 });
  }
  
  displaySelectedComponents();
}

// Display selected components
function displaySelectedComponents() {
  const container = document.getElementById('selected-components-list');
  
  container.innerHTML = selectedComponents.map((component, index) => `
    <div class="selected-component">
      <div class="component-header">
        <span class="component-title">${component.product_title} (x${component.quantity})</span>
        <span class="component-price">${component.price}€</span>
        <button class="btn-remove" onclick="removeComponent(${index})">×</button>
      </div>
      
      ${component.available_variants && component.available_variants.length > 1 ? `
        <div class="variant-customization">
          <label class="checkbox-label">
            <input type="checkbox" 
              ${component.allow_variant_selection ? 'checked' : ''} 
              onchange="toggleVariantSelection(${index})">
            Permitir al cliente elegir variante
          </label>
          
          ${component.allow_variant_selection ? `
            <div class="variants-preview">
              <small>Variantes disponibles:</small>
              <div class="variant-chips">
                ${component.available_variants.slice(0, 5).map(v => `
                  <span class="variant-chip">${v.title}</span>
                `).join('')}
                ${component.available_variants.length > 5 ? 
                  `<span class="variant-chip">+${component.available_variants.length - 5} más</span>` : ''}
              </div>
            </div>
          ` : `
            <div class="variant-fixed">
              <small>Variante fija: ${component.product_title}</small>
            </div>
          `}
        </div>
      ` : ''}
      
      <div class="component-actions">
        <button class="btn-qty" onclick="updateQuantity(${index}, -1)">-</button>
        <span>${component.quantity}</span>
        <button class="btn-qty" onclick="updateQuantity(${index}, 1)">+</button>
      </div>
    </div>
  `).join('');
  
  // Update price preview
  updatePricePreview();
}

// Update price preview
function updatePricePreview() {
  const bundlePrice = parseFloat(document.getElementById('bundle-price')?.value) || 0;
  const componentsTotal = selectedComponents.reduce((sum, comp) => {
    return sum + (parseFloat(comp.price) * (comp.quantity || 1));
  }, 0);
  
  const savings = componentsTotal - bundlePrice;
  const savingsPercent = componentsTotal > 0 ? ((savings / componentsTotal) * 100).toFixed(1) : 0;
  
  const pricePreview = `
    <div class="price-preview">
      <div class="price-row">
        <span>Total componentes:</span>
        <strong>${componentsTotal.toFixed(2)}€</strong>
      </div>
      <div class="price-row">
        <span>Precio bundle:</span>
        <strong>${bundlePrice.toFixed(2)}€</strong>
      </div>
      <div class="price-row savings ${savings > 0 ? 'positive' : 'negative'}">
        <span>Ahorro:</span>
        <strong>${savings > 0 ? '+' : ''}${savings.toFixed(2)}€ (${savingsPercent}%)</strong>
      </div>
    </div>
  `;
  
  const container = document.getElementById('selected-components-list');
  if (container) {
    // Remove old price preview if exists
    const oldPreview = container.querySelector('.price-preview');
    if (oldPreview) oldPreview.remove();
    
    // Add new preview
    container.insertAdjacentHTML('beforeend', pricePreview);
  }
}

// Update component quantity
function updateComponentQuantity(index, quantity) {
  selectedComponents[index].quantity = parseInt(quantity) || 1;
  displaySelectedComponents();
}

// Alias for updateQuantity (used in template)
function updateQuantity(index, delta) {
  const currentQty = selectedComponents[index].quantity || 1;
  const newQty = Math.max(1, currentQty + delta);
  selectedComponents[index].quantity = newQty;
  displaySelectedComponents();
}

// Remove component
function removeComponent(index) {
  selectedComponents.splice(index, 1);
  displaySelectedComponents();
}

// Create bundle
async function createBundle() {
  // Validar nombre del bundle
  const bundleName = document.getElementById('bundle-name').value.trim();
  if (!bundleName) {
    Swal.fire({
      icon: 'warning',
      title: 'Campo requerido',
      text: 'Por favor ingresa un nombre para el bundle'
    });
    return;
  }
  
  // Validar precio del bundle
  const bundlePrice = parseFloat(document.getElementById('bundle-price').value);
  if (!bundlePrice || bundlePrice <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Precio inválido',
      text: 'Por favor ingresa un precio válido para el bundle'
    });
    return;
  }
  
  if (selectedComponents.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin componentes',
      text: 'Agrega al menos un componente'
    });
    return;
  }
  
  // Show loading state
  const loadingAlert = Swal.fire({
    title: 'Creando bundle...',
    html: `
      <div style="padding: 20px;">
        <div class="spinner"></div>
        <p style="margin-top: 15px;">Obteniendo imágenes de componentes...</p>
        <p style="font-size: 0.9em; color: #666;">Esto puede tardar unos segundos</p>
      </div>
    `,
    showConfirmButton: false,
    allowOutsideClick: false,
    didOpen: () => {
      // Add spinner CSS if not exists
      if (!document.querySelector('#spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = `
          .spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #3498db;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `;
        document.head.appendChild(style);
      }
    }
  });
  
  try {
    const response = await fetch('/api/bundles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundleName: bundleName,
        bundlePrice: bundlePrice.toFixed(2),
        components: selectedComponents
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      closeCreateModal();
      
      // Show success message
      Swal.fire({
        icon: 'success',
        title: '¡Creado!',
        html: `
          <p>Bundle <strong>"${bundleName}"</strong> creado exitosamente</p>
          <p style="font-size: 0.9em; color: #666;">
            ${data.bundle?.config?.components?.length || 0} componentes · 
            ${data.bundle?.price || bundlePrice}€
          </p>
        `,
        timer: 3000,
        showConfirmButton: false
      });
      
      // Reload bundles to show the new one
      // Add small delay to ensure Shopify has processed everything
      setTimeout(() => {
        loadBundles();
      }, 1000);
    } else {
      Swal.close();
      showError(data.message);
    }
  } catch (error) {
    console.error('Create bundle error:', error);
    Swal.close();
    showError(error.message || 'Error al crear bundle');
  }
}

// Show error
function showError(message) {
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: message
  });
}
// Edit bundle function
async function editBundle(bundleId) {
  try {
    // Fetch bundle details
    const response = await fetch(`/api/bundles/${encodeURIComponent(bundleId)}`);
    const data = await response.json();
    
    if (!data.success) {
      showError(data.message);
      return;
    }
    
    const bundle = data.bundle;
    
    // Set edit mode
    editMode = true;
    editingBundleId = bundle.id;
    
    // Pre-fill form
    document.getElementById('bundle-name').value = bundle.title;
    document.getElementById('bundle-price').value = bundle.price;
    
    // Load components
    selectedComponents = bundle.components || [];
    
    // Open modal
    document.getElementById('createModal').style.display = 'block';
    
    // Go to step 2 if there are already components
    if (selectedComponents.length > 0) {
      goToStep(2);
      displaySelectedComponents();
    } else {
      goToStep(1);
    }
    
    // Change button text
    const createBtn = document.querySelector('.modal-actions button.btn-primary');
    if (createBtn) {
      createBtn.textContent = '✓ Actualizar Bundle';
      createBtn.onclick = updateBundle;
    }
  } catch (error) {
    showError('Error al cargar bundle');
    console.error(error);
  }
}

// Duplicate bundle function  
async function duplicateBundle(bundleId) {
  try {
    const response = await fetch(`/api/bundles/${encodeURIComponent(bundleId)}`);
    const data = await response.json();
    
    if (!data.success) {
      showError(data.message);
      return;
    }
    
    const bundle = data.bundle;
    
    // Reset edit mode
    editMode = false;
    editingBundleId = null;
    
    // Pre-fill form with duplicated data
    document.getElementById('bundle-name').value = bundle.title + ' (Copia)';
    document.getElementById('bundle-price').value = bundle.price;
    
    // Load components
    selectedComponents = JSON.parse(JSON.stringify(bundle.components || [])); // Deep copy
    
    // Open modal
    document.getElementById('createModal').style.display = 'block';
    goToStep(2);
    displaySelectedComponents();
  } catch (error) {
    showError('Error al duplicar bundle');
    console.error(error);
  }
}

// Update bundle function
async function updateBundle() {
  // Validar nombre del bundle
  const bundleName = document.getElementById('bundle-name').value.trim();
  if (!bundleName) {
    alert('Por favor ingresa un nombre para el bundle');
    return;
  }
  
  // Validar precio del bundle
  const bundlePrice = parseFloat(document.getElementById('bundle-price').value);
  if (!bundlePrice || bundlePrice <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Precio inválido',
      text: 'Por favor ingresa un precio válido para el bundle'
    });
    return;
  }
  
  if (selectedComponents.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Sin componentes',
      text: 'Agrega al menos un componente'
    });
    return;
  }
  
  try {
    const response = await fetch(`/api/bundles/${encodeURIComponent(editingBundleId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bundleName: bundleName,
        bundlePrice: bundlePrice.toFixed(2),
        components: selectedComponents
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      closeCreateModal();
      loadBundles();
      alert(`Bundle "${bundleName}" actualizado exitosamente!`);
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError('Error al actualizar bundle');
  }
}
// Bulk operations state
let selectedBundles = new Set();

// Toggle bundle selection
function toggleBundleSelection(bundleId, checkbox) {
  if (checkbox.checked) {
    selectedBundles.add(bundleId);
  } else {
    selectedBundles.delete(bundleId);
  }
  updateBulkDeleteButton();
}

// Update bulk delete button visibility
function updateBulkDeleteButton() {
  const btn = document.getElementById('bulk-delete-btn');
  if (selectedBundles.size > 0) {
    btn.style.display = 'inline-flex';
    btn.textContent = `🗑️ Eliminar ${selectedBundles.size} Seleccionados`;
  } else {
    btn.style.display = 'none';
  }
}

// Bulk delete selected bundles
async function bulkDelete() {
  const count = selectedBundles.size;
  
  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: `Se eliminarán ${count} bundles y sus productos`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#EF4444',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  });
  
  if (!result.isConfirmed) return;
  
  let successCount = 0;
  let failCount = 0;
  
  for (const bundleId of selectedBundles) {
    try {
      const response = await fetch('/api/bundles', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundleId })
      });
      
      if (response.ok) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
    }
  }
  
  selectedBundles.clear();
  updateBulkDeleteButton();
  loadBundles();
  
  Swal.fire({
    icon: successCount > 0 ? 'success' : 'error',
    title: 'Operación completada',
    text: `${successCount} eliminados, ${failCount} fallaron`,
    timer: 2000
  });
}

// Load more products (pagination)
let allProductsCache = [];
let displayedProductCount = 0;

async function loadMoreProducts() {
  currentPage++;
  await searchComponentProducts(true); // true = append mode
}

// Modified search to support pagination
async function searchComponentProducts(append = false) {
  const query = document.getElementById('component-search').value;
  
  if (!append) {
    currentPage = 1;
    displayedProductCount = 0;
  }
  
  try {
    // Add delay to prevent rate limiting
    await new Promise(resolve => setTimeout(resolve, 400));
    
    const response = await fetch(`/api/products?q=${encodeURIComponent(query)}&limit=${PRODUCTS_PER_PAGE}&page=${currentPage}`);
    const data = await response.json();
    
    if (data.success) {
      if (append) {
        allProductsCache = [...allProductsCache, ...data.products];
      } else {
        allProductsCache = data.products;
      }
      
      displayComponentProducts(allProductsCache);
      displayedProductCount = allProductsCache.length;
      
      // Show/hide "Load More" button
      const loadMoreContainer = document.getElementById('load-more-container');
      if (data.products.length >= PRODUCTS_PER_PAGE) {
        loadMoreContainer.style.display = 'block';
      } else {
        loadMoreContainer.style.display = 'none';
      }
    }
  } catch (error) {
    console.error('Error loading products:', error);
  }
}
// Bulk change status (activate/deactivate)
async function bulkChangeStatus() {
  const count = selectedBundles.size;
  
  const result = await Swal.fire({
    title: 'Cambiar estado',
    text: `Selecciona el nuevo estado para ${count} bundles`,
    icon: 'question',
    showCancelButton: true,
    showDenyButton: true,
    confirmButtonText: 'Activar',
    denyButtonText: 'Borrador',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#10B981',
    denyButtonColor: '#6B7280'
  });
  
  if (result.isDismissed) return;
  
  const newStatus = result.isConfirmed ? 'active' : 'draft';
  let successCount = 0;
  let failCount = 0;
  
  for (const bundleId of selectedBundles) {
    try {
      const response = await fetch(`/api/bundles/${encodeURIComponent(bundleId)}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      if (response.ok) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      failCount++;
    }
  }
  
  selectedBundles.clear();
  updateBulkDeleteButton();
  loadBundles();
  
  Swal.fire({
    icon: successCount > 0 ? 'success' : 'error',
    title: 'Operación completada',
    text: `${successCount} actualizados, ${failCount} fallaron`,
    timer: 2000
  });
}

// Export bundles to CSV
async function exportCSV() {
  try {
    const response = await fetch('/api/bundles/export');
    const blob = await response.blob();
    
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bundles_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    
    Swal.fire({
      icon: 'success',
      title: 'Exportado',
      text: 'Bundles exportados a CSV',
      timer: 2000
    });
  } catch (error) {
    showError('Error al exportar CSV');
  }
}

// Import bundles from CSV
async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;
  
  const formData = new FormData();
  formData.append('csv', file);
  
  try {
    const response = await fetch('/api/bundles/import', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: 'Importado',
        html: `
          <p>Bundles importados: ${data.created}</p>
          <p>Errores: ${data.errors}</p>
        `,
        timer: 3000
      });
      loadBundles();
    } else {
      showError(data.message);
    }
  } catch (error) {
    showError('Error al importar CSV');
  }
  
  input.value = ''; // Reset input
}

// Update bulk buttons visibility
function updateBulkDeleteButton() {
  const deleteBtn = document.getElementById('bulk-delete-btn');
  const statusBtn = document.getElementById('bulk-status-btn');
  
  if (selectedBundles.size > 0) {
    deleteBtn.style.display = 'inline-flex';
    statusBtn.style.display = 'inline-flex';
    deleteBtn.textContent = `🗑️ Eliminar ${selectedBundles.size}`;
    statusBtn.textContent = `⚡ Cambiar Estado (${selectedBundles.size})`;
  } else {
    deleteBtn.style.display = 'none';
    statusBtn.style.display = 'none';
  }
}
// Bundle Templates System
let bundleTemplates = JSON.parse(localStorage.getItem('bundleTemplates') || '[]');
let stockFilterActive = false;
let allBundlesCache = [];

// Toggle stock filter
function toggleStockFilter() {
  stockFilterActive = !stockFilterActive;
  const btn = document.getElementById('filter-stock-btn');
  
  if (stockFilterActive) {
    btn.classList.add('btn-primary');
    btn.classList.remove('btn-secondary');
    const filtered = allBundlesCache.filter(bundle => {
      const hasLowStock = (bundle.config?.components || []).some(c => 
        c.stock !== 'N/A' && c.stock < 5
      );
      return hasLowStock;
    });
    displayBundles(filtered);
  } else {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    displayBundles(allBundlesCache);
  }
}

// Save current bundle config as template
function saveAsTemplate() {
  const bundleName = document.getElementById('bundle-name').value.trim();
  const bundlePrice = parseFloat(document.getElementById('bundle-price').value);
  
  if (!bundleName || !bundlePrice || selectedComponents.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Datos incompletos',
      text: 'Completa el bundle antes de guardarlo como template'
    });
    return;
  }
  
  Swal.fire({
    title: 'Nombre del Template',
    input: 'text',
    inputValue: bundleName,
    showCancelButton: true,
    confirmButtonText: 'Guardar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed && result.value) {
      const template = {
        id: Date.now(),
        name: result.value,
        bundleName: bundleName,
        bundlePrice: bundlePrice,
        components: JSON.parse(JSON.stringify(selectedComponents)),
        createdAt: new Date().toISOString()
      };
      
      bundleTemplates.push(template);
      localStorage.setItem('bundleTemplates', JSON.stringify(bundleTemplates));
      
      Swal.fire({
        icon: 'success',
        title: 'Template guardado',
        text: `Template "${result.value}" guardado exitosamente`,
        timer: 2000
      });
    }
  });
}

// Open templates modal
function openTemplatesModal() {
  document.getElementById('templatesModal').style.display = 'block';
  displayTemplates();
}

// Close templates modal
function closeTemplatesModal() {
  document.getElementById('templatesModal').style.display = 'none';
}

// Display templates list
function displayTemplates() {
  const container = document.getElementById('templates-list');
  
  if (bundleTemplates.length === 0) {
    container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No hay templates guardados</p>';
    return;
  }
  
  container.innerHTML = bundleTemplates.map(template => `
    <div class="template-card">
      <div class="template-header">
        <h4>${template.name}</h4>
        <span class="template-date">${new Date(template.createdAt).toLocaleDateString()}</span>
      </div>
      <div class="template-info">
        <p><strong>Precio:</strong> ${template.bundlePrice}€</p>
        <p><strong>Componentes:</strong> ${template.components.length}</p>
      </div>
      <div class="template-actions">
        <button class="btn btn-primary" onclick="loadTemplate(${template.id})">📋 Usar</button>
        <button class="btn btn-danger" onclick="deleteTemplate(${template.id})">🗑️</button>
      </div>
    </div>
  `).join('');
}

// Load template
function loadTemplate(templateId) {
  const template = bundleTemplates.find(t => t.id === templateId);
  if (!template) return;
  
  // Close templates modal
  closeTemplatesModal();
  
  // Open create modal with template data
  editMode = false;
  editingBundleId = null;
  
  document.getElementById('bundle-name').value = template.bundleName;
  document.getElementById('bundle-price').value = template.bundlePrice;
  selectedComponents = JSON.parse(JSON.stringify(template.components));
  
  document.getElementById('createModal').style.display = 'block';
  goToStep(2);
  displaySelectedComponents();
  
  Swal.fire({
    icon: 'success',
    title: 'Template cargado',
    text: `Template "${template.name}" cargado. Puedes modificarlo antes de crear.`,
    timer: 2000
  });
}

// Delete template
function deleteTemplate(templateId) {
  Swal.fire({
    title: '¿Eliminar template?',
    text: 'Esta acción no se puede deshacer',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#EF4444',
    cancelButtonColor: '#6B7280',
    confirmButtonText: 'Sí, eliminar',
    cancelButtonText: 'Cancelar'
  }).then((result) => {
    if (result.isConfirmed) {
      bundleTemplates = bundleTemplates.filter(t => t.id !== templateId);
      localStorage.setItem('bundleTemplates', JSON.stringify(bundleTemplates));
      displayTemplates();
      
      Swal.fire({
        icon: 'success',
        title: 'Eliminado',
        text: 'Template eliminado',
        timer: 1500
      });
    }
  });
}
// Upload bundle image
async function uploadBundleImage(productId, imageFile) {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    const response = await fetch(`/api/bundles/${encodeURIComponent(productId)}/image`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('Error uploading image:', data.message);
    }
  } catch (error) {
    console.error('Error uploading image:', error);
  }
}

// Fetch sales analytics for bundle
async function fetchBundleAnalytics(bundleId) {
  try {
    const response = await fetch(`/api/bundles/${encodeURIComponent(bundleId)}/analytics`);
    const data = await response.json();
    return data.sales || 0;
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return 0;
  }
}
// History Modal Functions
async function openHistoryModal(bundleId) {
  document.getElementById('historyModal').style.display = 'block';
  
  try {
    const response = await fetch(`/api/bundles/${encodeURIComponent(bundleId)}/history`);
    const data = await response.json();
    
    if (data.success) {
      displayHistory(data.history);
    } else {
      document.getElementById('history-timeline').innerHTML = `
        <p style="text-align: center; color: var(--text-muted);">No se pudo cargar el historial</p>
      `;
    }
  } catch (error) {
    console.error('Error loading history:', error);
    document.getElementById('history-timeline').innerHTML = `
      <p style="text-align: center; color: var(--danger);">Error al cargar historial</p>
    `;
  }
}

function closeHistoryModal() {
  document.getElementById('historyModal').style.display = 'none';
}

function displayHistory(history) {
  const timeline = document.getElementById('history-timeline');
  
  if (!history || history.length === 0) {
    timeline.innerHTML = `
      <p style="text-align: center; color: var(--text-muted);">No hay cambios registrados</p>
    `;
    return;
  }
  
  timeline.innerHTML = history.map(entry => {
    const date = new Date(entry.date);
    const formattedDate = date.toLocaleString('es-ES');
    
    let icon = '📝';
    let color = 'var(--primary)';
    
    switch(entry.action) {
      case 'created':
        icon = '✨';
        color = 'var(--success)';
        break;
      case 'updated':
        icon = '✏️';
        color = 'var(--primary)';
        break;
      case 'price_changed':
        icon = '💰';
        color = 'var(--warning)';
        break;
      case 'components_changed':
        icon = '🔧';
        color = 'var(--info)';
        break;
    }
    
    return `
      <div class="history-entry">
        <div class="history-icon" style="background: ${color}">${icon}</div>
        <div class=" history-content">
          <div class="history-header">
            <strong>${getActionText(entry.action)}</strong>
            <span class="history-date">${formattedDate}</span>
          </div>
          ${entry.changes ? `<div class="history-changes">${formatChanges(entry.changes)}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getActionText(action) {
  const actions = {
    'created': 'Bundle creado',
    'updated': 'Bundle actualizado',
    'price_changed': 'Precio modificado',
    'components_changed': 'Componentes modificados',
    'name_changed': 'Nombre cambiado'
  };
  return actions[action] || 'Cambio realizado';
}

function formatChanges(changes) {
  if (typeof changes === 'string') return changes;
  if (typeof changes === 'object') {
    return Object.entries(changes).map(([key, value]) => 
      `<div><strong>${key}:</strong> ${value}</div>`
    ).join('');
  }
  return '';
}
// Fetch variants for a product
async function fetchProductVariants(productId) {
  try {
    const response = await fetch(`/api/products/${encodeURIComponent(productId)}/variants`);
    const data = await response.json();
    
    if (data.success) {
      return data.variants;
    }
    return [];
  } catch (error) {
    console.error('Error fetching variants:', error);
    return [];
  }
}

// Updated addComponent to fetch variants
async function addComponent(componentData) {
  // Extract product ID from variant GID
  const variantId = componentData.variant_id;
  const productId = componentData.product_id || await getProductIdFromVariant(variantId);
  
  // Fetch all variants for this product
  const allVariants = await fetchProductVariants(productId);
  
 selectedComponents.push({
    ...componentData,
    product_id: productId,
    quantity: 1, // ALWAYS initialize quantity to 1
    allow_variant_selection: allVariants.length > 1, // Only allow if multiple variants exist
    available_variants: allVariants,
    default_variant_id: variantId
  });
  
  displaySelectedComponents();
}

// Helper to get product ID from variant
async function getProductIdFromVariant(variantId) {
  try {
    const response = await fetch(`/api/products?limit=558`); // Get all products
    const data = await response.json();
    if (data.success) {
      for (const product of data.products) {
        // Check if any variant matches (compare full GIDs)
        const hasVariant = product.variants.some(v => v.id === variantId);
        if (hasVariant) {
          return product.id; // Product ID already in GID format from database
        }
      }
    }
  } catch (e) {
    console.error('Error getting product ID:', e);
  }
  console.warn(`Product not found for variant: ${variantId}`);
  return null;
}

// Toggle variant customization
function toggleVariantSelection(index) {
  selectedComponents[index].allow_variant_selection = !selectedComponents[index].allow_variant_selection;
  displaySelectedComponents();
}
