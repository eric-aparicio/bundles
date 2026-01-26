/**
 * CSV Export/Import Functions for Bundles
 */

/**
 * Export all bundles to CSV file
 */
async function exportCSV() {
  try {
    Swal.fire({
      title: 'Exportando...',
      text: 'Preparando archivo CSV',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Get all bundles
    const response = await fetch('/api/bundles');
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Error al obtener bundles');
    }

    const bundles = data.bundles || [];
    
    if (bundles.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Sin datos',
        text: 'No hay bundles para exportar'
      });
      return;
    }

    // Create CSV content
    const headers = [
      'Bundle Title',
      'Bundle Price',
      'Status',
      'Component 1 ID',
      'Component 1 Title',
      'Component 1 Quantity',
      'Component 2 ID',
      'Component 2 Title',
      'Component 2 Quantity',
      'Component 3 ID',
      'Component 3 Title',
      'Component 3 Quantity',
      'Component 4 ID',
      'Component 4 Title',
      'Component 4 Quantity',
      'Component 5 ID',
      'Component 5 Title',
      'Component 5 Quantity'
    ];

    const rows = bundles.map(bundle => {
      const components = bundle.config?.components || [];
      const row = [
        escapeCSV(bundle.title),
        bundle.price || '0',
        bundle.status || 'draft'
      ];

      // Add up to 5 components
      for (let i = 0; i < 5; i++) {
        if (components[i]) {
          row.push(
            escapeCSV(components[i].variant_id),
            escapeCSV(components[i].product_title),
            components[i].quantity || 1
          );
        } else {
          row.push('', '', '');
        }
      }

      return row;
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `bundles_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    Swal.fire({
      icon: 'success',
      title: '¡Exportado!',
      text: `${bundles.length} bundles exportados a CSV`,
      timer: 2000
    });

  } catch (error) {
    console.error('Error exporting CSV:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: 'Error al exportar CSV: ' + error.message
    });
  }
}

/**
 * Import bundles from CSV file
 */
async function importCSV(input) {
  const file = input.files[0];
  if (!file) return;

  try {
    Swal.fire({
      title: 'Importando...',
      text: 'Procesando archivo CSV',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      throw new Error('El archivo CSV está vacío o no tiene datos');
    }

    // Skip header
    const dataLines = lines.slice(1);
    const bundles = [];

    for (const line of dataLines) {
      const values = parseCSVLine(line);
      
      if (values.length < 3) continue; // Skip invalid lines

      const bundleTitle = values[0];
      const bundlePrice = values[1];
      const status = values[2] || 'draft';

      // Parse components (groups of 3: ID, Title, Quantity)
      const components = [];
      for (let i = 3; i < values.length; i += 3) {
        const variantId = values[i];
        const productTitle = values[i + 1];
        const quantity = parseInt(values[i + 2]) || 1;

        if (variantId && productTitle) {
          components.push({
            variant_id: variantId,
            product_title: productTitle,
            quantity: quantity
          });
        }
      }

      if (bundleTitle && bundlePrice && components.length > 0) {
        bundles.push({
          bundleName: bundleTitle,
          bundlePrice: bundlePrice,
          components: components,
          status: status
        });
      }
    }

    if (bundles.length === 0) {
      throw new Error('No se encontraron bundles válidos en el CSV');
    }

    // Send to server
    const response = await fetch('/api/bundles/import', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ bundles })
    });

    const data = await response.json();

    if (data.success) {
      Swal.fire({
        icon: 'success',
        title: '¡Importado!',
        html: `
          <p>Bundles creados: <strong>${data.created || 0}</strong></p>
          <p>Errores: <strong>${data.errors || 0}</strong></p>
        `,
        timer: 3000
      });
      loadBundles();
    } else {
      throw new Error(data.message || 'Error al importar bundles');
    }

  } catch (error) {
    console.error('Error importing CSV:', error);
    Swal.fire({
      icon: 'error',
      title: 'Error al importar',
      text: error.message
    });
  }

  // Reset input
  input.value = '';
}

/**
 * Escape CSV value (handle commas and quotes)
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Parse CSV line (handle quoted fields)
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}
