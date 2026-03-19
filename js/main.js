/**
 * KAMBO FINE JEWELRY — main.js
 * Lógica interactiva: nav, animaciones, catálogo dinámico, filtros, stats, formulario
 */

/* ── Config ──────────────────────────────────────────── */
const WHATSAPP_NUMBER = '573014009541';

/* 
 * NOTA: Para producción, estas constantes pueden ser inyectadas 
 * por un build-step o mantenerse aquí para sitios estáticos.
 */
const CONFIG = {
  SUPABASE_URL: 'https://bpvoqukdgffkqkwkiagw.supabase.co',
  SUPABASE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwdm9xdWtkZ2Zma3Frd2tpYWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxNTM1OTEsImV4cCI6MjA4ODcyOTU5MX0.mlNuOt90xEBL0Qzl42xWVg17aUcMXhFBkWsXEuh_8EE',
  TABLE_NAME: 'Productos',
  CLIENT_ID: 'Kambo',
  CACHE_KEY: 'kambo_catalog_v4', // Cambiamos a v4 para forzar limpieza de caché en tu navegador
  CACHE_TIME: 30 * 60 * 1000,
  PLACEHOLDER_IMG: 'assets/images/placeholder.png'
};

/** Helper para persistencia con metadatos de carga */
const cache = {
  get(key) {
    const itemStr = localStorage.getItem(key);
    if (!itemStr) return null;
    try {
      const item = JSON.parse(itemStr);
      return item; // Devolvemos el objeto completo para chequear el timestamp
    } catch (e) {
      return null;
    }
  },
  set(key, data) {
    const item = {
      data,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(item));
  },
  shouldRefresh(key) {
    const item = this.get(key);
    if (!item) return true;
    const minutesSinceLoad = (Date.now() - item.timestamp) / (1000 * 60);
    return minutesSinceLoad > 30; // Regla de los 30 minutos
  }
};




/* ── Estado global del catálogo ──────────────────────── */
let allProducts = [];       // Todos los productos cargados desde la API
let activeCat = 'all';    // Filtro activo de categoría
let activeMetal = 'all';    // Filtro activo de metal

/** true when on the catalog page — false on home (shows only popular products) */
const IS_CATALOG = window.location.pathname.includes('catalogo');

/**
 * Renderiza el catálogo final según contexto (home vs catalog).
 * En home: muestra solo productos con evento='popular' (máx 6), sin filtros.
 * En catálogo: muestra todos con filtros completos.
 */
function finishCatalogRender(grid, emptyEl) {
  if (!IS_CATALOG) {
    // Hide filter UI on home
    const fw = document.querySelector('.filters-wrapper');
    if (fw) fw.style.display = 'none';

    const popular = allProducts.filter(function (p) {
      return (p.evento || '').toLowerCase().trim() === 'popular';
    }).slice(0, 6);

    renderProducts(grid, emptyEl, popular.length ? popular : allProducts.slice(0, 6));
    return;
  }
  initProductFilter(grid, emptyEl);
  renderProducts(grid, emptyEl, allProducts);
}

/* ── DOM Ready ───────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initNav();
  initHeroParallax();
  initScrollAnimations();
  initStatCounters();
  initWhatsAppFloat();
  initContactForm();
  initRefreshButton();

  if (window.location.pathname.includes('producto')) {
    initProductPage();
  } else if (document.getElementById('products-grid')) {
    loadCatalog();
  }

  // REGLA DE ORO: Solo hablar con la DB si el usuario vuelve tras mucho tiempo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (cache.shouldRefresh(CONFIG.CACHE_KEY)) {
        console.log('[Kambo] Sesión expirada o usuario vuelve tras inactividad. Sincronizando...');
        if (window.location.pathname.includes('producto')) {
          initProductPage();
        } else {
          loadCatalog();
        }
      }
    }
  });
});

/** 
 * Inicializa el botón de refresco manual con cooldown de 10s
 * para evitar abuso de peticiones.
 */
function initRefreshButton() {
  const btn = document.getElementById('btn-refresh-catalog');
  if (!btn) return;

  let isRefreshing = false;
  const COOLDOWN_MS = 10000; // 10 segundos de espera entre refrescos manuales

  btn.addEventListener('click', async () => {
    if (isRefreshing) return;

    try {
      isRefreshing = true;
      btn.classList.add('loading');
      btn.disabled = true;

      console.log('[Kambo] Refresco manual solicitado...');

      // Forzar limpieza de caché local para estos datos específicos
      localStorage.removeItem(CONFIG.CACHE_KEY);

      // Recargar catálogo
      await loadCatalog();

      // DETENER ANIMACIÓN apenas terminen los datos (usualmente < 1s)
      btn.classList.remove('loading');

      // MANTENER DESHABILITADO por seguridad (cooldown) hasta los 10s
      setTimeout(() => {
        btn.disabled = false;
        isRefreshing = false;
      }, COOLDOWN_MS);

    } catch (err) {
      console.error('[Kambo] Error en refresco manual:', err);
      btn.classList.remove('loading');
      btn.disabled = false;
      isRefreshing = false;
    }
  });
}

async function fetchCatalogSafely() {
  const tryFetch = async (tableName) => {
    const url = `${CONFIG.SUPABASE_URL}/rest/v1/${encodeURIComponent(tableName)}?select=*`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        cache: 'no-cache', // Evitar problemas de caché de navegador si actualizan DB
        headers: {
          'apikey': CONFIG.SUPABASE_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        return data || [];
      }

      const errorBody = await response.text();
      console.warn(`[Kambo] Error en URL ${url}: ${response.status} - ${errorBody}`);
      return null;
    } catch (e) {
      console.warn(`[Kambo] Error de red en ${url}:`, e);
      return null;
    }
  };

  try {
    let rawData = await tryFetch(CONFIG.TABLE_NAME);

    if (!rawData) {
      throw new Error('No se pudo establecer conexión con la tabla de productos.');
    }

    // Mapear campos de Supabase a nuestra estructura interna
    // Filtrar productos placeholder (nombre 'x') que dañan autoridad de marca en Google
    return rawData
      .filter(item => {
        const nombre = (item.nombre || '').trim().toLowerCase();
        return nombre !== 'x' && nombre !== '';
      })
      .map(item => {
        return {
          id: item.id || item.uuid,
          nombre: item.nombre || 'Pieza sin nombre',
          descripcion: item.descripcion || '',
          precio: item.precio,
          precio_oferta: item['precio oferta'],
          categoria: item.categoria || 'Joyas',
          evento: item.eventos, // mapped from eventos as requested
          metal: item.metal,
          piedra: item.piedra,
          img_url: item.img_url || '',
          existencias: item.stock || 0
        };
      });


  } catch (err) {
    console.error('Error fetching Supabase catalog:', err);
    throw err;
  }
}



/* ══════════════════════════════════════════════════════
   PÁGINA DE PRODUCTO INDIVIDUAL
══════════════════════════════════════════════════════ */

async function initProductPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const productId = urlParams.get('id');
  const container = document.getElementById('product-detail-container');
  const loader = document.getElementById('product-page-loader');

  if (!productId) {
    if (loader) loader.innerHTML = '<p>Producto no encontrado. <a href="/catalogo" style="color:var(--color-gold);text-decoration:underline;">Volver al catálogo</a></p>';
    return;
  }

  try {
    let products = [];
    const cachedItem = cache.get(CONFIG.CACHE_KEY);

    if (cachedItem && !cache.shouldRefresh(CONFIG.CACHE_KEY)) {
      products = cachedItem.data;
    } else {
      const data = await fetchCatalogSafely();
      products = Array.isArray(data) ? data : [];
      products.forEach((p, i) => { if (!p.id) p.id = `prod-${i}`; });
      cache.set(CONFIG.CACHE_KEY, products);
    }


    const product = products.find(p => String(p.id) === String(productId));

    if (loader) loader.remove();

    if (!product) {
      if (container) container.innerHTML = '<div class="container" style="padding: 100px 0; text-align: center;"><p>Producto no encontrado. <a href="/catalogo" style="color:var(--color-gold);text-decoration:underline;">Volver al catálogo</a></p></div>';
      return;
    }

    renderProductDetail(product, container);
    // Actualizar meta tags OG/JSON-LD con datos reales del producto
    if (typeof window.__updateProductMeta === 'function') {
      window.__updateProductMeta(product);
    }

    // Piezas Similares
    renderSimilarProducts(product, products, container);

  } catch (err) {
    console.error('Error cargando producto:', err);
    if (loader) loader.innerHTML = '<p>Error cargando la información. <a href="/catalogo" style="color:var(--color-gold);text-decoration:underline;">Volver al catálogo</a></p>';
  }
}

function renderProductDetail(product, container) {
  const {
    nombre = '',
    descripcion = '',
    precio = '',
    precio_oferta = '',
    metal = '',
    piedra = '',
    categoria = '',
    img_url = '',
    evento = '',
    existencias
  } = product;

  // Lógica de disponibilidad
  let availabilityHTML = '';
  let pricingHTML = '';
  let buttonText = 'Contactar para compra';
  const isBajoPedido = (evento || '').toLowerCase().trim() === 'bajo pedido';
  const stockCount = parseInt(existencias || 0);

  if (isBajoPedido) {
    pricingHTML = '<div class="product-detail__price-quote">Precio bajo cotización</div>';
    buttonText = 'Solicitar Cotización Personalizada';
    availabilityHTML = `
      <div class="availability-tag availability-tag--order">
        <span class="icon">✨</span>
        <span><strong>Pieza Exclusiva Bajo Pedido</strong></span>
      </div>
    `;
  } else {
    // Precio para piezas comunes
    const isOferta = (evento || '').toLowerCase().trim() === 'oferta';
    const finalPrice = isOferta && precio_oferta ? precio_oferta : precio;

    if (finalPrice) {
      const pStr = String(finalPrice).replace(/\./g, '');
      const formattedPrice = Number(pStr.trim()).toLocaleString('es-CO');

      if (isOferta && precio) {
        const oldPrice = String(precio).replace(/\./g, '');
        const formattedOld = Number(oldPrice.trim()).toLocaleString('es-CO');
        pricingHTML = `
          <div class="price-container">
            <div class="price-old">$${formattedOld}</div>
            <div class="price-new">$${formattedPrice}</div>
          </div>
        `;
      } else {
        pricingHTML = `<span class="product-card__price-val">$${formattedPrice}</span>`;
      }
    }
    pricingHTML = `<p class="product-detail__price">${pricingHTML}</p>`;

    // Productos comunes: mostramos existencias
    if (stockCount > 0) {
      availabilityHTML = `
        <div class="availability-tag availability-tag--stock">
          <span class="icon">🔥</span>
          <span><strong>En Stock</strong> — ${stockCount} ${stockCount === 1 ? 'unidad disponible' : 'unidades disponibles'}</span>
        </div>
      `;
    } else {
      availabilityHTML = `
        <div class="availability-tag availability-tag--out">
          <span class="icon">🔴</span>
          <span><strong>Sin stock disponible</strong></span>
        </div>
      `;
    }
  }

  const images = parseImages(img_url);

  if (images.length === 0) images = ['assets/images/placeholder.png'];


  const waMsg = encodeURIComponent(`Hola Kambo! \nMe interesa ${isBajoPedido ? 'cotizar la pieza personalizada' : 'adquirir la pieza'}: ${nombre}${metal ? '\nMetal: ' + metal : ''}${piedra ? '\nPiedra: ' + piedra : ''}`);

  /* ── Carrusel de imágenes ── */
  const pdImagesHTML = images.map((src, i) => `
    <img src="${escapeAttr(src)}"
         alt="${escapeAttr(nombre)} — imagen ${i + 1}"
         class="pd-carousel__img${i === 0 ? ' active' : ''}"
         id="pd-img-${i}"
         loading="${i === 0 ? 'eager' : 'lazy'}"
         onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'">`
  ).join('');

  const hasMultiple = images.length > 1;

  const pdArrowsHTML = hasMultiple ? `
    <button class="pd-carousel__btn pd-carousel__btn--prev"
            aria-label="Imagen anterior"
            onclick="window.pdPrev(${images.length})">&#8249;</button>
    <button class="pd-carousel__btn pd-carousel__btn--next"
            aria-label="Imagen siguiente"
            onclick="window.pdNext(${images.length})">&#8250;</button>` : '';

  const pdDotsHTML = hasMultiple ? `
    <div class="pd-carousel__dots">
      ${images.map((_, i) => `
        <button class="pd-carousel__dot${i === 0 ? ' active' : ''}"
                aria-label="Imagen ${i + 1}"
                onclick="window.pdGoto(${i}, ${images.length})"></button>`
      ).join('')}
    </div>` : '';

  const pdCounterHTML = hasMultiple
    ? `<div class="pd-carousel__counter" id="pd-counter">1 / ${images.length}</div>`
    : '';

  const pdBadgeHTML = evento
    ? `<div class="pd-carousel__badge">✦ ${escapeHTML(evento)}</div>`
    : '';

  container.innerHTML = `
    <div class="product-detail-theme">
      <div class="container product-detail">
        <div class="product-detail__grid">
          <div class="product-detail__gallery">
            <div class="pd-carousel">
              <div class="pd-carousel__stage">
                ${pdImagesHTML}
                ${pdBadgeHTML}
                ${pdCounterHTML}
              </div>
              ${pdArrowsHTML}
              ${pdDotsHTML}
            </div>
          </div>
          
          <div class="product-detail__info">
            <nav class="product-detail__breadcrumbs">
              <a href="/">Inicio</a> 
              <span class="sep">/</span> 
              <a href="/catalogo">Catálogo</a> 
              <span class="sep">/</span> 
              <span class="curr">${escapeHTML(categoria)}</span>
            </nav>
            
            <div class="product-detail__header">
              <span class="product-detail__label">${escapeHTML(categoria)}</span>
              <h1 class="product-detail__title">${escapeHTML(nombre)}</h1>
              <div class="product-detail__price-wrap">
                ${pricingHTML}
              </div>
            </div>
            
            ${availabilityHTML}
            
            <div class="product-detail__specifications">
              <h3 class="spec-title">Especificaciones <em>Técnicas</em></h3>
              <div class="spec-grid">
                ${metal ? `<div class="spec-item"><span class="label">Metal Precioso</span><span class="val">${escapeHTML(metal)}</span></div>` : ''}
                ${piedra ? `<div class="spec-item"><span class="label">Piedra Central</span><span class="val">${escapeHTML(piedra)}</span></div>` : ''}
                <div class="spec-item"><span class="label">Origen</span><span class="val">Bogotá, Colombia</span></div>
              </div>
            </div>
            
            <div class="product-detail__desc">
              <h3 class="desc-heading">Historia y Detalles</h3>
              <p>${escapeHTML(descripcion)}</p>
            </div>
            
            <div class="product-detail__actions">
              <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}" target="_blank" rel="noopener" class="btn btn--primary btn--full btn--luxury-wa">
                ${WA_SVG} <span>${buttonText}</span>
              </a>
              <div class="product-detail__trust">
                <div class="trust-pill"><span class="icon">✦</span> Certificado de Autenticidad</div>
                <div class="trust-pill"><span class="icon">✈</span> Envío Asegurado</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════
   PIEZAS SIMILARES — sección al final del producto
══════════════════════════════════════════════════════ */
function renderSimilarProducts(currentProduct, allProds, detailContainer) {
  if (!allProds || allProds.length < 2) return;

  const cat = (currentProduct.categoria || '').toLowerCase();

  // 1. Misma categoría, excluyendo la pieza actual
  let similar = allProds.filter(p =>
    String(p.id) !== String(currentProduct.id) &&
    (p.categoria || '').toLowerCase() === cat
  );

  // 2. Si hay menos de 3, completar con piezas de otras categorías (aleatorio)
  if (similar.length < 3) {
    const others = allProds.filter(p =>
      String(p.id) !== String(currentProduct.id) &&
      (p.categoria || '').toLowerCase() !== cat
    ).sort(() => Math.random() - 0.5);
    similar = [...similar, ...others].slice(0, 4);
  } else {
    similar = similar.slice(0, 4);
  }

  if (similar.length === 0) return;

  // 3. Crear sección y renderizar cards
  const section = document.createElement('section');
  section.className = 'similar-products';
  section.innerHTML = `
    <div class="container">
      <div class="similar-products__header">
        <p class="similar-products__eyebrow">También te puede interesar</p>
        <h2 class="similar-products__title">Piezas <em>Similares</em></h2>
      </div>
      <div class="products similar-products__grid" id="similar-grid"></div>
    </div>
  `;

  detailContainer.appendChild(section);

  const grid = section.querySelector('#similar-grid');
  grid.innerHTML = similar.map((p, i) => createProductCard(p, i)).join('');

  // 4. Inicializar animaciones e intervalos del carrusel
  requestAnimationFrame(() => {
    grid.querySelectorAll('[data-animate]').forEach(el => {
      const obs = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
      obs.observe(el);
    });

    if (!window.carouselIntervals) window.carouselIntervals = [];
    grid.querySelectorAll('.product-carousel-container').forEach(container => {
      const imgs = container.querySelectorAll('.carousel-img');
      if (imgs.length <= 1) return;
      let isVisible = false;
      container.dataset.currentIndex = '0';
      container.dataset.totalImages = imgs.length;
      const obs = new IntersectionObserver(entries => {
        isVisible = entries[0].isIntersecting;
      }, { threshold: 0.1 });
      obs.observe(container);
      const id = setInterval(() => {
        if (!isVisible || container.dataset.manual === 'true') return;
        nextSlide(container, true);
      }, 3500);
      window.carouselIntervals.push(id);
    });
  });
}

/* ──────────────────────────────────────────────────────
   pd-carousel helpers  (galería de detalle de producto)
────────────────────────────────────────────────────── */
let _pdCurrentIndex = 0;

function _pdSync(index, total) {
  _pdCurrentIndex = (index + total) % total;

  document.querySelectorAll('.pd-carousel__img').forEach((el, i) => {
    el.classList.toggle('active', i === _pdCurrentIndex);
  });

  document.querySelectorAll('.pd-carousel__dot').forEach((el, i) => {
    el.classList.toggle('active', i === _pdCurrentIndex);
  });

  const counter = document.getElementById('pd-counter');
  if (counter) counter.textContent = `${_pdCurrentIndex + 1} / ${total}`;
}

window.pdGoto = function (index, total) { _pdSync(index, total); };
window.pdNext  = function (total)        { _pdSync(_pdCurrentIndex + 1, total); };
window.pdPrev  = function (total)        { _pdSync(_pdCurrentIndex - 1, total); };

/* ── aliases legacy (por si quedan referencias) ── */
window.changeDetailImage = function (index) {
  const total = document.querySelectorAll('.pd-carousel__img').length;
  _pdSync(index, total || 1);
};

window.nextPrevDetailImage = function (dir, total) {
  _pdSync(_pdCurrentIndex + dir, total);
};

/* ══════════════════════════════════════════════════════
   CATÁLOGO DINÁMICO — fetch + render
══════════════════════════════════════════════════════ */

/**
 * Carga el catálogo desde la API y lo renderiza.
 * La API de Google Apps Script debe estar publicada con acceso "Cualquier persona".
 */
async function loadCatalog() {
  const grid = document.getElementById('products-grid');
  const emptyEl = document.getElementById('catalog-empty');

  try {
    const cachedItem = cache.get(CONFIG.CACHE_KEY);

    // 1. Si hay caché válida, renderizar de inmediato y no poner skeletons
    if (cachedItem && !cache.shouldRefresh(CONFIG.CACHE_KEY)) {
      allProducts = cachedItem.data;
      finishCatalogRender(grid, emptyEl);
      return;
    }

    // 2. Si no hay caché o está expirada, mostrar skeletons mientras traemos nuevos datos
    renderSkeletonCards(grid);

    const data = await fetchCatalogSafely();
    allProducts = Array.isArray(data) ? data : [];

    // Asignar IDs si faltan
    allProducts.forEach((p, i) => {
      if (!p.id) p.id = `prod-${i}`;
    });

    // Guardar en caché
    cache.set(CONFIG.CACHE_KEY, allProducts);


    if (!allProducts.length) {
      showCatalogEmpty(emptyEl);
      grid.innerHTML = ''; // Limpiar skeletons
      return;
    }

    finishCatalogRender(grid, emptyEl);

  } catch (err) {
    console.error('[Kambo] Falló carga crítica:', err);

    // Intento de recuperación: ¿Hay algo en la caché aunque sea vieja?
    const staleData = localStorage.getItem(CONFIG.CACHE_KEY);
    if (staleData) {
      console.log('[Kambo] Usando datos obsoletos de caché por error de red.');
      const parsed = JSON.parse(staleData);
      allProducts = parsed.data || [];
      finishCatalogRender(grid, emptyEl);
      return;
    }

    grid.innerHTML = `
        <div class="catalog-loader__error" style="grid-column: 1/-1; text-align:center; padding: 3rem 1rem;">
          <p>⚠️ No pudimos conectar con la galería de lujo en este momento.</p>
          <small style="display:block; margin: 1rem 0; color: #888;">${err.message}</small>
          <a href="https://wa.me/${WHATSAPP_NUMBER}?text=Hola%20Kambo%2C%20quiero%20conocer%20su%20colecci%C3%B3n"
             target="_blank" rel="noopener" class="btn btn--outline btn--sm">Asesoría Directa WhatsApp</a>
        </div>`;
  }
}

/** Renderiza tarjetas "fantasmas" mientras carga el contenido real */
function renderSkeletonCards(grid) {
  let skeletons = '';
  for (let i = 0; i < 4; i++) {
    skeletons += `
      <div class="product-card skeleton-card">
        <div class="skeleton-media" style="aspect-ratio: 1/1; background: #1a1a18; border-radius: 8px; margin-bottom: 1rem;"></div>
        <div class="skeleton-line" style="height: 12px; width: 40%; background: #222; margin-bottom: 0.5rem;"></div>
        <div class="skeleton-line" style="height: 20px; width: 80%; background: #222; margin-bottom: 0.5rem;"></div>
        <div class="skeleton-line" style="height: 15px; width: 60%; background: #222;"></div>
      </div>`;
  }
  grid.innerHTML = skeletons;
}


/**
 * Crea el HTML de una tarjeta de producto a partir del objeto proveniente de la API.
 * Campos esperados: id, nombre, descripcion, precio, metal, piedra, categoria, evento, img_url
 */
function createProductCard(product, index) {
  const {
    id,
    nombre = 'Pieza exclusiva',
    descripcion = '',
    precio = '',
    precio_oferta = '',
    metal = '',
    piedra = '',
    categoria = '',
    evento = '',
    img_url = '',
    existencias
  } = product;

  /* Disponibilidad */
  let availabilityCardHTML = '';
  const ev = (evento || '').toLowerCase().trim();
  const isBajoPedido = ev === 'bajo pedido';
  const stockCount = parseInt(existencias || 0);

  if (isBajoPedido) {
    availabilityCardHTML = `<p class="product-card__availability product-card__availability--order">✨ Bajo pedido</p>`;
  } else if (stockCount > 0) {
    availabilityCardHTML = `<p class="product-card__availability product-card__availability--stock">🔥 Stock: ${stockCount} un.</p>`;
  } else {
    availabilityCardHTML = `<p class="product-card__availability product-card__availability--out">🔴 Agotado</p>`;
  }

  /* Badge (glassmorphism pill, mismo estilo que versión anterior) */
  let badgeHTML = '';
  if (isBajoPedido) {
    badgeHTML = `<div class="product-card__badge product-card__badge--order">✦ Exclusivo</div>`;
  } else if (ev === 'limitado' || ev === 'ed. limitada') {
    badgeHTML = `<div class="product-card__badge product-card__badge--limited">Ed. Limitada</div>`;
  } else if (ev === 'oferta') {
    badgeHTML = `<div class="product-card__badge product-card__badge--sale">Oferta</div>`;
  } else if (ev === 'popular') {
    badgeHTML = `<div class="product-card__badge product-card__badge--hot">Popular</div>`;
  }

  /* Precio formateado */
  let precioTextHTML = '';
  if (isBajoPedido) {
    precioTextHTML = '<span class="product-card__price-quote">Cotizar</span>';
  } else {
    const isOferta = ev === 'oferta';
    const finalPrice = isOferta && precio_oferta ? precio_oferta : precio;

    if (finalPrice) {
      const pStr = String(finalPrice).replace(/\./g, '');
      const formattedPrice = Number(pStr.trim()).toLocaleString('es-CO');

      if (isOferta && precio) {
        const oldPrice = String(precio).replace(/\./g, '');
        const formattedOld = Number(oldPrice.trim()).toLocaleString('es-CO');
        precioTextHTML = `
          <div class="price-container">
            <div class="price-old">$${formattedOld}</div>
            <div class="price-new">$${formattedPrice}</div>
          </div>`;
      } else {
        precioTextHTML = `$${formattedPrice}`;
      }
    } else {
      precioTextHTML = 'Consultar';
    }
  }

  /* WhatsApp */
  const waMsg = encodeURIComponent(
    `Hola Kambó! Me interesa ${isBajoPedido ? 'cotizar' : 'la pieza'}: ${nombre}` +
    (metal  ? `\nMetal: ${metal}`  : '') +
    (piedra ? `\nPiedra: ${piedra}` : '')
  );
  const waLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`;

  /* Meta */
  const metalMeta = [metal, piedra].filter(Boolean).join(' · ');

  /* Imágenes */
  const images = parseImages(img_url);
  if (images.length === 0) images = [CONFIG.PLACEHOLDER_IMG];
  const imgAlt = `${nombre} — Kambó Fine Jewelry`;

  /* Crossfade carousel images */
  const imagesHTML = images.map((src, i) => `
    <img
      src="${escapeAttr(src)}"
      alt="${escapeAttr(imgAlt)}"
      class="carousel-img${i === 0 ? ' active' : ''}"
      loading="lazy"
      draggable="false"
      onerror="this.src='${CONFIG.PLACEHOLDER_IMG}'"
    />`).join('');

  /* Arrows + dots (solo si hay más de una imagen) */
  let carouselControlsHTML = '';
  if (images.length > 1) {
    const dotsHTML = images.map((_, i) =>
      `<span class="carousel-dot${i === 0 ? ' active' : ''}"
             onclick="event.stopPropagation(); gotoSlide(this.closest('.product-carousel-container'), ${i})"></span>`
    ).join('');

    carouselControlsHTML = `
      <button class="carousel-btn carousel-btn--prev" aria-label="Anterior"
              onclick="event.stopPropagation(); prevSlide(this.closest('.product-carousel-container'))">‹</button>
      <button class="carousel-btn carousel-btn--next" aria-label="Siguiente"
              onclick="event.stopPropagation(); nextSlide(this.closest('.product-carousel-container'))">›</button>
      <div class="carousel-dots">${dotsHTML}</div>`;
  }

  /* WhatsApp SVG icon */
  const waSVG = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>`;

  /* Delay escalonado */
  const delay = (index % 4) * 0.1;
  const productUrl = `/producto?id=${encodeURIComponent(id)}`;

  return `
    <article
      class="product-card product-carousel-container"
      data-category="${escapeAttr(categoria.toLowerCase())}"
      data-metal="${escapeAttr(metal.toLowerCase())}"
      data-animate="fade-up"
      style="--delay:${delay}s"
      onclick="window.location.href='${productUrl}'"
      role="link"
      tabindex="0"
      onkeydown="if(event.key==='Enter')window.location.href='${productUrl}'"
    >
      <div class="product-card__img-wrap">
        ${imagesHTML}
        ${carouselControlsHTML}
        ${badgeHTML}
      </div>

      <div class="product-card__body">
        <p class="product-card__gem">${escapeHTML(categoria)}</p>
        <h3 class="product-card__name">${escapeHTML(nombre)}</h3>
        ${metalMeta ? `<p class="product-card__meta">${escapeHTML(metalMeta)}</p>` : ''}
        ${descripcion ? `<p class="product-card__desc">${escapeHTML(descripcion)}</p>` : ''}
        ${availabilityCardHTML}

        <div class="product-card__divider"></div>

        <div class="product-card__footer">
          <span class="product-card__price">${precioTextHTML}</span>
          <a
            href="${waLink}"
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn--whatsapp"
            onclick="event.stopPropagation()"
            aria-label="Cotizar ${escapeAttr(nombre)} por WhatsApp"
          >${waSVG} ${isBajoPedido ? 'Cotizar' : 'WhatsApp'}</a>
        </div>
      </div>
    </article>`;
}

/** Renderiza los productos filtrados en el grid */
function renderProducts(grid, emptyEl, products) {
  // 1. Limpiar los intervalos del carrusel de renderizados anteriores
  if (window.carouselIntervals) {
    window.carouselIntervals.forEach(clearInterval);
  }
  window.carouselIntervals = [];

  grid.innerHTML = products.map((p, i) => createProductCard(p, i)).join('');

  if (!products.length) {
    showCatalogEmpty(emptyEl);
  } else {
    if (emptyEl) emptyEl.style.display = 'none';
    // Activar animaciones para las nuevas tarjetas
    requestAnimationFrame(() => {
      grid.querySelectorAll('[data-animate]').forEach(el => {
        const observer = new IntersectionObserver(
          entries => {
            entries.forEach(entry => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
        );
        observer.observe(el);
      });

      // Inicializar auto-carruseles para los productos
      grid.querySelectorAll('.product-carousel-container').forEach(container => {
        const images = container.querySelectorAll('.carousel-img');
        if (images.length <= 1) return; // Solo animar si hay múltiples

        let currentIndex = 0;
        let isVisible = false;

        // Guardar estado en el elemento para control manual
        container.dataset.currentIndex = currentIndex;
        container.dataset.totalImages = images.length;

        // Optimización: solo rotar imágenes si la tarjeta es visible
        const observer = new IntersectionObserver((entries) => {
          isVisible = entries[0].isIntersecting;
        }, { threshold: 0.1 });
        observer.observe(container);

        const id = setInterval(() => {
          if (!isVisible || container.dataset.manual === 'true') return;

          nextSlide(container, true);
        }, 3500); // transicionar cada 3.5 segundos

        window.carouselIntervals.push(id);
      });
    });
  }
}

/* ── Carousel slide helpers ── */
function _syncDots(container, newIndex) {
  container.querySelectorAll('.carousel-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === newIndex);
  });
}

window.nextSlide = function (container, isAuto = false) {
  if (!isAuto) container.dataset.manual = 'true';
  const images = container.querySelectorAll('.carousel-img');
  let idx = parseInt(container.dataset.currentIndex || '0', 10);
  images[idx].classList.remove('active');
  idx = (idx + 1) % images.length;
  images[idx].classList.add('active');
  container.dataset.currentIndex = idx;
  _syncDots(container, idx);
};

window.prevSlide = function (container) {
  container.dataset.manual = 'true';
  const images = container.querySelectorAll('.carousel-img');
  let idx = parseInt(container.dataset.currentIndex || '0', 10);
  images[idx].classList.remove('active');
  idx = (idx - 1 + images.length) % images.length;
  images[idx].classList.add('active');
  container.dataset.currentIndex = idx;
  _syncDots(container, idx);
};

window.gotoSlide = function (container, targetIndex) {
  container.dataset.manual = 'true';
  const images = container.querySelectorAll('.carousel-img');
  const idx = parseInt(container.dataset.currentIndex || '0', 10);
  images[idx].classList.remove('active');
  images[targetIndex].classList.add('active');
  container.dataset.currentIndex = targetIndex;
  _syncDots(container, targetIndex);
};

function showCatalogEmpty(emptyEl) {
  if (emptyEl) emptyEl.style.display = 'block';
}

/** Aplica los filtros activos y actualiza el grid */
function applyFilters(grid, emptyEl) {
  const filtered = allProducts.filter(p => {
    const cat = (p.categoria || '').toLowerCase();
    const metal = (p.metal || '').toLowerCase();

    const catOk = activeCat === 'all' || cat === activeCat;
    const metalOk = activeMetal === 'all' || metal === activeMetal;

    return catOk && metalOk;
  });
  renderProducts(grid, emptyEl, filtered);
}

/* ══════════════════════════════════════════════════════
   FILTROS — categoría + metal
══════════════════════════════════════════════════════ */
function initProductFilter(grid, emptyEl) {
  const catContainer = document.getElementById('dynamic-category-filters');
  const metalContainer = document.getElementById('dynamic-metal-filters');

  if (catContainer && metalContainer && allProducts.length > 0) {
    const categoriesMap = new Map();
    const metalsMap = new Map();

    allProducts.forEach(p => {
      const cat = (p.categoria || '').trim();
      if (cat) {
        const key = cat.toLowerCase();
        if (!categoriesMap.has(key)) categoriesMap.set(key, cat);
      }

      const metal = (p.metal || '').trim();
      if (metal) {
        const key = metal.toLowerCase();
        if (!metalsMap.has(key)) metalsMap.set(key, metal);
      }
    });

    let catHTML = `
      <span class="filter__label">Categoría:</span>
      <button class="filter__btn ${activeCat === 'all' ? 'active' : ''}" data-filter-cat="all">Todos</button>
    `;
    categoriesMap.forEach((originalName, key) => {
      const label = originalName.charAt(0).toUpperCase() + originalName.slice(1);
      catHTML += `<button class="filter__btn ${activeCat === key ? 'active' : ''}" data-filter-cat="${escapeAttr(key)}">${escapeHTML(label)}</button>`;
    });
    catContainer.innerHTML = catHTML;

    let metalHTML = `
      <span class="filter__label">Metal:</span>
      <button class="filter__btn filter__btn--metal ${activeMetal === 'all' ? 'active' : ''}" data-filter-metal="all">Todos</button>
    `;
    metalsMap.forEach((originalName, key) => {
      let icon = '';
      if (key.includes('oro')) icon = '🟡 ';
      if (key.includes('plata')) icon = '⚪ ';
      const label = originalName.charAt(0).toUpperCase() + originalName.slice(1);
      metalHTML += `<button class="filter__btn filter__btn--metal ${activeMetal === key ? 'active' : ''}" data-filter-metal="${escapeAttr(key)}">${icon}${escapeHTML(label)}</button>`;
    });
    metalContainer.innerHTML = metalHTML;
  }

  /* Botones de categoría */
  document.querySelectorAll('[data-filter-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.dataset.filterCat;
      applyFilters(grid, emptyEl);
    });
  });

  /* Botones de metal */
  document.querySelectorAll('[data-filter-metal]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter-metal]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeMetal = btn.dataset.filterMetal;
      applyFilters(grid, emptyEl);
    });
  });
}

/* ══════════════════════════════════════════════════════
   NAVIGATION
══════════════════════════════════════════════════════ */
function initNav() {
  const header = document.getElementById('header');
  const navToggle = document.getElementById('nav-toggle');
  const navList = document.getElementById('nav-list');
  const navLinks = document.querySelectorAll('.nav__link');

  /* Sticky header on scroll */
  const onScroll = () => {
    header.classList.toggle('header--scrolled', window.scrollY > 60);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ── Mobile nav helpers ── */
  // CSS sets .nav__list { display:none } on mobile by default — NO JS init needed.
  // This is the only reliable way to prevent the fixed+translateX(100%) element
  // from registering as page width before JS runs.

  function openNav() {
    clearTimeout(navList._closeTimer);
    // Step 1: make display:flex (CSS .is-visible), still at translateX(100%)
    navList.classList.add('is-visible');
    // Step 1b: add nav-is-open to header BEFORE the reflow so that
    // will-change:auto takes effect (removes the stacking-context trap
    // that prevents position:fixed from covering the full viewport on
    // Chrome/iOS Safari when will-change:transform is present on the header).
    header.classList.add('nav-is-open');
    navToggle.classList.add('is-open');
    navToggle.setAttribute('aria-expanded', 'true');
    // Step 2: force layout flush — browser now sees will-change:auto on header
    navList.getBoundingClientRect();
    // Step 3: add .is-open → CSS transition fires: translateX(100%) → translateX(0)
    navList.classList.add('is-open');
    // body (not html) overflow — keeps html as the scroll container so
    // position:fixed elements stay correctly anchored to viewport on iOS Safari
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    // Step 1: remove .is-open → CSS transition fires: translateX(0) → translateX(100%)
    navList.classList.remove('is-open');
    navToggle.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    header.classList.remove('nav-is-open');
    document.body.style.overflow = '';
    // Step 2: after slide-out completes, remove .is-visible → CSS: display:none
    navList._closeTimer = setTimeout(() => {
      if (!navList.classList.contains('is-open')) {
        navList.classList.remove('is-visible');
      }
    }, 240);
  }

  /* Hamburger toggle */
  navToggle.addEventListener('click', () => {
    navList.classList.contains('is-open') ? closeNav() : openNav();
  });

  /* Close on link click */
  navLinks.forEach(link => {
    link.addEventListener('click', () => closeNav());
  });

  /* Close on outside tap (backdrop) */
  document.addEventListener('click', (e) => {
    if (navList.classList.contains('is-open') &&
      !navList.contains(e.target) &&
      !navToggle.contains(e.target)) {
      closeNav();
    }
  });

  /* Active section highlight — use IntersectionObserver for performance.
     Legacy offsetTop calculations on scroll (layout thrashing) cause jerky movements on mobile. */
  const observerOptions = {
    root: null,
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        const link = document.querySelector(`.nav__link[href="#${id}"]`);

        if (link) {
          // Reset all
          document.querySelectorAll('.nav__link').forEach(l => {
            l.removeAttribute('aria-current');
            l.classList.remove('is-active');
          });
          // Set current
          link.setAttribute('aria-current', 'page');
          link.classList.add('is-active');
        }
      }
    });
  }, observerOptions);

  const watchSections = document.querySelectorAll('section[id]');
  watchSections.forEach(section => observer.observe(section));
}

/* ══════════════════════════════════════════════════════
   HERO PARALLAX
   Mueve la imagen de fondo según el scroll
══════════════════════════════════════════════════════ */
function initHeroParallax() {
  const heroImg = document.querySelector('.hero__img');
  if (!heroImg) return;

  let ticking = false;

  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scroll = window.pageYOffset;
        if (scroll <= window.innerHeight) {
          // Aumentamos a 0.25 para que el movimiento sea más obvio
          const movement = scroll * 0.25;
          heroImg.style.transform = `translate3d(0, ${movement}px, 0)`;
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

/* ══════════════════════════════════════════════════════
   SCROLL ANIMATIONS — IntersectionObserver
══════════════════════════════════════════════════════ */
function initScrollAnimations() {
  const animElements = document.querySelectorAll('[data-animate]');
  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' }
  );
  animElements.forEach(el => observer.observe(el));
}

/* ══════════════════════════════════════════════════════
   STAT COUNTERS — animate numbers
══════════════════════════════════════════════════════ */
function initStatCounters() {
  const statNums = document.querySelectorAll('[data-count]');

  const animateCount = (el) => {
    const target = +el.dataset.count;
    const duration = 1800;
    const step = 16;
    const steps = duration / step;
    const increment = target / steps;
    let current = 0;

    const tick = () => {
      current += increment;
      if (current < target) {
        el.textContent = Math.floor(current);
        requestAnimationFrame(tick);
      } else {
        el.textContent = target;
      }
    };
    requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );
  statNums.forEach(el => observer.observe(el));
}

/* ══════════════════════════════════════════════════════
   WHATSAPP FLOATING BUTTON
══════════════════════════════════════════════════════ */
function initWhatsAppFloat() {
  const floatBtn = document.getElementById('whatsapp-float');
  if (!floatBtn) return;
  const toggle = () => floatBtn.classList.toggle('visible', window.scrollY > 300);
  window.addEventListener('scroll', toggle, { passive: true });
  toggle();
}

/* ══════════════════════════════════════════════════════
   CONTACT FORM — compose WhatsApp message
══════════════════════════════════════════════════════ */
function initContactForm() {
  const form = document.getElementById('contact-form');
  if (!form) return;

  form.addEventListener('submit', e => {
    e.preventDefault();

    const name = sanitize(form.elements['name']?.value.trim());
    const metal = sanitize(form.elements['metal']?.value);
    const occasion = sanitize(form.elements['occasion']?.value.trim());
    const message = sanitize(form.elements['message']?.value.trim());

    if (!name || !metal || !message) {
      showFormError(form, 'Por favor completa los campos principales (Nombre, Metal y Idea/Mensaje).');
      return;
    }

    const text = [
      `*Nueva Solicitud de Cotización - Kambo*`,
      `---------------------------------------`,
      `Nombre: ${name}`,
      `Metal: ${metal}`,
      `Ocasión: ${occasion || 'No especificada'}`,
      `Idea/Mensaje: ${message}`,
      `---------------------------------------`,
      `(Opcional: Si tienes una imagen del diseño, puedes adjuntarla aquí)`
    ].join('\n');

    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');

    form.reset();
    showFormSuccess(form, '¡Solicitud preparada! Te redirigimos a WhatsApp para asesorarte.');
  });
}
/* ── Helpers ─────────────────────────────────────────── */

/** Escapa texto para insertar como contenido HTML (previene XSS) */
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = String(str ?? '');
  return div.innerHTML;
}

/** Escapa string para usar dentro de atributos HTML */
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Sanitiza input de formularios */
function sanitize(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showFormSuccess(form, msg) {
  removeFormFeedback(form);
  const el = document.createElement('p');
  el.className = 'form-feedback form-feedback--success';
  el.textContent = msg;
  el.style.cssText = 'color:#34d399;font-size:.85rem;margin-top:.5rem;font-weight:500;';
  form.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

function showFormError(form, msg) {
  removeFormFeedback(form);
  const el = document.createElement('p');
  el.className = 'form-feedback form-feedback--error';
  el.textContent = msg;
  el.style.cssText = 'color:#f87171;font-size:.85rem;margin-top:.5rem;font-weight:500;';
  form.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function removeFormFeedback(form) {
  const existing = form.querySelector('.form-feedback');
  if (existing) existing.remove();
}

/* ── SVG reutilizable de WhatsApp ────────────────────── */
const WA_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.890-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
</svg>`;

/** Normaliza la obtención de imágenes desde múltiples formatos (Array, Object, CSV, JSON string) */
function parseImages(imgData) {
  if (!imgData) return [CONFIG.PLACEHOLDER_IMG];

  // 1. Si ya es un array
  if (Array.isArray(imgData)) return imgData.length ? imgData : [CONFIG.PLACEHOLDER_IMG];

  // 2. Si es un objeto de tipo {"imagen_1": "url1", "imagen_2": "url2"}
  if (typeof imgData === 'object') {
    const urls = Object.values(imgData).filter(val => typeof val === 'string' && val.startsWith('http'));
    return urls.length ? urls : [CONFIG.PLACEHOLDER_IMG];
  }

  // 3. Si es un string
  if (typeof imgData === 'string') {
    const trimmed = imgData.trim();
    if (!trimmed) return [CONFIG.PLACEHOLDER_IMG];

    // Intentar procesar como JSON string
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (typeof parsed === 'object') {
          return parseImages(parsed); // Recursión para manejar lo que salga del JSON
        }
      } catch (e) {
        // Si falla el JSON, tratamos como texto plano
      }
    }

    // Procesar como lista separada por comas
    const split = trimmed.split(',').map(u => u.trim()).filter(u => u.length > 0);
    return split.length ? split : [CONFIG.PLACEHOLDER_IMG];
  }

  return [CONFIG.PLACEHOLDER_IMG];
}
