(function () {
  "use strict";

  var PRODUCTS_URL = sitePath("data/products.json");
  var PLACEHOLDER_LIMIT = 8;
  var productCache = null;
  var slugUtils = window.amcolSlugUtils;

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function sitePath(path) {
    var cleanPath = text(path).replace(/^\/+/, "");
    if (!cleanPath) return "";
    if (window.location.protocol === "file:") return cleanPath;
    return new URL("/" + cleanPath, window.location.origin).href;
  }

  function createSlug(value) {
    return slugUtils && slugUtils.createSlug ? slugUtils.createSlug(value) : text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function createProductUrl(product) {
    if (slugUtils && slugUtils.createProductUrl) return slugUtils.createProductUrl(product);
    var params = new URLSearchParams();
    if (product.productId) params.set("id", product.productId);
    if (product.slug) params.set("slug", product.slug);
    return "product-detail.html" + (params.toString() ? "?" + params.toString() : "");
  }

  function searchUrl(query) {
    var params = new URLSearchParams();
    params.set("search", text(query));
    return "products.html?" + params.toString() + "#catalogResults";
  }

  function brandUrl(brand) {
    var slug = createSlug(brand);
    return slug ? "products.html?brand=" + encodeURIComponent(slug) + "#catalogResults" : searchUrl(brand);
  }

  function terms(query) {
    var parts = {};
    text(query)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .forEach(function (part) {
        if (part) parts[part] = true;
      });
    createSlug(query)
      .split("-")
      .forEach(function (part) {
        if (part) parts[part] = true;
      });
    return Object.keys(parts);
  }

  function searchableProduct(product) {
    return [
      product.productName,
      product.productId,
      product.brand,
      product.department,
      product.category,
      product.model,
      Array.isArray(product.tags) ? product.tags.join(" ") : "",
    ]
      .map(text)
      .concat([createSlug(product.productName), createSlug(product.brand), createSlug(product.category)])
      .join(" ")
      .toLowerCase();
  }

  function matches(value, query) {
    var haystack = text(value).toLowerCase();
    return terms(query).every(function (term) {
      return haystack.indexOf(term) !== -1;
    });
  }

  function loadProducts() {
    if (productCache) return Promise.resolve(productCache);
    return fetch(PRODUCTS_URL, { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("Failed to load nav search catalogue: " + response.status + " " + response.statusText);
        return response.json();
      })
      .then(function (products) {
        productCache = Array.isArray(products) ? products : [];
        return productCache;
      })
      .catch(function (error) {
        console.error("[AMCOL nav search] Search suggestions unavailable:", error);
        productCache = [];
        return productCache;
      });
  }

  function buildSuggestions(products, query) {
    var records = [];
    var seen = {};

    products.forEach(function (product) {
      var name = text(product.productName);
      var key = "product:" + text(product.productId || product.slug || name);
      if (!name || seen[key] || !matches(searchableProduct(product), query)) return;
      seen[key] = true;
      records.push({
        type: "Product",
        title: name,
        meta: [product.brand, product.category].map(text).filter(Boolean).join(" / ") || "View product",
        href: createProductUrl(product),
      });
    });

    products.forEach(function (product) {
      var brand = text(product.brand);
      var brandKey = "brand:" + createSlug(brand);
      if (brand && !seen[brandKey] && matches(brand, query)) {
        seen[brandKey] = true;
        records.push({ type: "Brand", title: brand, meta: "Browse brand", href: brandUrl(brand) });
      }
    });

    return records.slice(0, PLACEHOLDER_LIMIT);
  }

  function firstProductSuggestion(query) {
    return loadProducts().then(function (products) {
      return buildSuggestions(products, query).find(function (record) {
        return record.type === "Product";
      });
    });
  }

  function ensureSuggestions(form, input) {
    var existing = form.querySelector(".hero-nav-search-suggestions");
    if (existing) return existing;
    var list = document.createElement("div");
    list.className = "hero-nav-search-suggestions";
    list.setAttribute("role", "listbox");
    list.hidden = true;
    form.appendChild(list);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-expanded", "false");
    return list;
  }

  function renderSuggestions(list, input, records, query) {
    if (!text(query) || !records.length) {
      list.hidden = true;
      list.innerHTML = "";
      input.setAttribute("aria-expanded", "false");
      return;
    }

    list.innerHTML = records
      .map(function (record, index) {
        return (
          '<button type="button" class="hero-nav-search-suggestion" role="option" data-nav-search-suggestion="true" data-href="' +
          escapeHtml(record.href) +
          '" id="heroNavSearchSuggestion' +
          index +
          '"><span>' +
          escapeHtml(record.title) +
          '</span><small>' +
          escapeHtml(record.type + " - " + record.meta) +
          "</small></button>"
        );
      })
      .join("") +
      '<button type="button" class="hero-nav-search-suggestion hero-nav-search-submit" role="option" data-nav-search-suggestion="true" data-href="' +
      escapeHtml(searchUrl(query)) +
      '"><span>Search for "' +
      escapeHtml(query) +
      '"</span><small>Show matching products and brands</small></button>';
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function initForm(form) {
    var input = form.querySelector('input[type="search"]');
    if (!input) return;
    var list = ensureSuggestions(form, input);
    var debounceTimer = null;

    form.addEventListener("submit", function (event) {
      if (form.dataset.navSearchSelecting === "true") {
        event.preventDefault();
        return;
      }
      var query = text(input.value);
      if (!query) return;
      event.preventDefault();
      firstProductSuggestion(query).then(function (record) {
        window.location.assign(record ? record.href : searchUrl(query));
      });
    });

    input.addEventListener("input", function () {
      window.clearTimeout(debounceTimer);
      var query = text(input.value);
      if (!query) {
        renderSuggestions(list, input, [], query);
        return;
      }
      debounceTimer = window.setTimeout(function () {
        loadProducts().then(function (products) {
          renderSuggestions(list, input, buildSuggestions(products, query), query);
        });
      }, 120);
    });

    input.addEventListener("focus", function () {
      var query = text(input.value);
      if (!query) return;
      loadProducts().then(function (products) {
        renderSuggestions(list, input, buildSuggestions(products, query), query);
      });
    });

    list.addEventListener("pointerdown", function (event) {
      var link = event.target.closest("[data-nav-search-suggestion]");
      if (!link) return;
      form.dataset.navSearchSelecting = "true";
      window.setTimeout(function () {
        delete form.dataset.navSearchSelecting;
      }, 700);
    });

    list.addEventListener("click", function (event) {
      var link = event.target.closest("[data-nav-search-suggestion]");
      if (!link) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      delete form.dataset.navSearchSelecting;
      var href = text(link.dataset.href);
      if (href) window.location.assign(href);
    });

    document.addEventListener("click", function (event) {
      if (form.contains(event.target)) return;
      list.hidden = true;
      input.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll(".hero-nav-search").forEach(initForm);
  });
})();
