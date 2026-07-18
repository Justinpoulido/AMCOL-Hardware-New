(function () {
  "use strict";

  var PRODUCTS_URL = "data/products.json";
  var HIERARCHY_URL = "data/category-hierarchy.json";
  var PLACEHOLDER_IMAGE = "images/product-placeholder.svg";
  var PAGE_SIZE = 24;
  var LAST_PRODUCT_ROUTE_KEY = "amcolLastProductRoute";
  var productCache = null;
  var hierarchyCache = null;
  var slugUtils = window.amcolSlugUtils;

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function createSlug(value) {
    return slugUtils.createSlug(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function escapeHtml(value) {
    return text(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function productHref(product) {
    var id = text(product.productId);
    var slug = text(product.slug);
    var params = new URLSearchParams();
    if (id) params.set("id", id);
    if (slug) params.set("slug", slug);
    return "product-detail.html" + (params.toString() ? "?" + params.toString() : "");
  }

  function listingHref(filters) {
    var params = new URLSearchParams();
    if (filters.departmentSlug) params.set("department", createSlug(filters.departmentSlug));
    if (filters.categorySlug) params.set("category", createSlug(filters.categorySlug));
    if (filters.brand) params.set("brand", createSlug(filters.brand));
    if (filters.search) params.set("search", filters.search);
    return "products.html" + (params.toString() ? "?" + params.toString() : "") + "#catalogResults";
  }

  function imageSrc(product) {
    return text(product.imageUrl) || PLACEHOLDER_IMAGE;
  }

  function imageAlt(product) {
    return text(product.altImageDescription) || text(product.productName) || "Product image unavailable";
  }

  function safeImageError(img) {
    if (img.dataset.fallbackApplied === "true") return;
    img.dataset.fallbackApplied = "true";
    img.src = PLACEHOLDER_IMAGE;
  }

  window.amcolProductImageError = safeImageError;

  function loadJson(url) {
    return fetch(url, { cache: "no-store" }).then(function (response) {
      if (!response.ok) throw new Error("Could not load " + url + ".");
      return response.json();
    });
  }

  function loadProducts() {
    if (productCache) return Promise.resolve(productCache);
    return loadJson(PRODUCTS_URL).then(function (products) {
      productCache = Array.isArray(products) ? products : [];
      return productCache;
    });
  }

  function loadHierarchy() {
    if (hierarchyCache) return Promise.resolve(hierarchyCache);
    return loadJson(HIERARCHY_URL).then(function (hierarchy) {
      hierarchyCache = Array.isArray(hierarchy) ? hierarchy : [];
      return hierarchyCache;
    });
  }

  function searchableText(product) {
    var values = [
      product.productName,
      product.productId,
      product.brand,
      product.department,
      product.departmentSlug,
      product.category,
      product.categorySlug,
      product.model,
      product.description,
      Array.isArray(product.tags) ? product.tags.join(" ") : "",
    ];
    return values
      .concat(values.map(createSlug))
      .map(text)
      .join(" ")
      .toLowerCase();
  }

  function searchTerms(query) {
    var terms = {};
    text(query)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .forEach(function (term) {
        if (term) terms[term] = true;
      });
    createSlug(query)
      .split("-")
      .forEach(function (term) {
        if (term) terms[term] = true;
      });
    return Object.keys(terms);
  }

  function matchesSearchText(haystack, query) {
    var terms = searchTerms(query);
    if (!terms.length) return true;
    var textValue = text(haystack).toLowerCase();
    return terms.every(function (term) {
      return textValue.indexOf(term) !== -1;
    });
  }

  function uniqueSorted(products, key) {
    var values = {};
    products.forEach(function (product) {
      var value = text(product[key]);
      if (value) values[value] = true;
    });
    return Object.keys(values).sort(function (a, b) {
      return a.localeCompare(b);
    });
  }

  function createProductCard(product, extraClass) {
    var meta = [];
    if (text(product.brand)) meta.push('<span class="catalog-card-meta-item">' + escapeHtml(product.brand) + "</span>");
    if (text(product.department)) meta.push('<span class="catalog-card-meta-item">' + escapeHtml(product.department) + "</span>");
    if (text(product.category)) meta.push('<span class="catalog-card-meta-item">' + escapeHtml(product.category) + "</span>");
    var model = text(product.model) ? '<p class="catalog-card-model">Model: ' + escapeHtml(product.model) + "</p>" : "";
    var price = text(product.price)
      ? '<p class="catalog-card-price">' + escapeHtml(product.price) + (text(product.currency) ? " " + escapeHtml(product.currency) : "") + "</p>"
      : "";
    var stock = text(product.stockStatus) ? '<p class="catalog-card-stock">' + escapeHtml(product.stockStatus) + "</p>" : "";
    return (
      '<article class="catalog-card ' +
      (extraClass || "") +
      '"><a class="catalog-card-link" href="' +
      escapeHtml(productHref(product)) +
      '" data-product-id="' +
      escapeHtml(product.productId) +
      '" data-product-slug="' +
      escapeHtml(product.slug) +
      '"><span class="catalog-card-image"><img src="' +
      escapeHtml(imageSrc(product)) +
      '" alt="' +
      escapeHtml(imageAlt(product)) +
      '" loading="lazy" width="320" height="240" onerror="amcolProductImageError(this)"></span><span class="catalog-card-body"><span class="catalog-card-meta">' +
      meta.join("") +
      '</span><span class="catalog-card-title">' +
      escapeHtml(product.productName) +
      '</span><span class="catalog-card-id">Product ID: ' +
      escapeHtml(product.productId) +
      "</span>" +
      model +
      price +
      stock +
      "</span></a></article>"
    );
  }

  function buildCounts(products) {
    var departments = {};
    var categories = {};
    products.forEach(function (product) {
      var departmentSlug = createSlug(product.departmentSlug || product.department);
      var categorySlug = createSlug(product.categorySlug || product.category);
      if (departmentSlug) departments[departmentSlug] = (departments[departmentSlug] || 0) + 1;
      if (departmentSlug && categorySlug) {
        var key = departmentSlug + "::" + categorySlug;
        categories[key] = (categories[key] || 0) + 1;
      }
    });
    return { departments: departments, categories: categories };
  }

  function updateUrl(state) {
    var url = new URL(window.location.href);
    if (state.search) {
      url.searchParams.set("search", state.search);
      url.searchParams.delete("query");
    } else {
      url.searchParams.delete("search");
      url.searchParams.delete("query");
    }
    if (state.departmentSlug) url.searchParams.set("department", createSlug(state.departmentSlug));
    else url.searchParams.delete("department");
    if (state.categorySlug) url.searchParams.set("category", createSlug(state.categorySlug));
    else url.searchParams.delete("category");
    if (state.brandSlug) url.searchParams.set("brand", createSlug(state.brandSlug));
    else {
      url.searchParams.delete("brand");
      url.searchParams.delete("brandSearch");
    }
    if (state.page > 1) url.searchParams.set("page", state.page);
    else url.searchParams.delete("page");
    if (state.departmentSlug || state.categorySlug || state.brandSlug || state.search) url.hash = "catalogResults";
    if (state.pushHistory) {
      window.history.pushState({}, "", url);
      state.pushHistory = false;
    } else {
      window.history.replaceState({}, "", url);
    }
  }

  function paginationPages(current, total) {
    var pages = [];
    var last = 0;
    for (var i = 1; i <= total; i += 1) {
      if (i === 1 || i === total || Math.abs(i - current) <= 2) {
        if (last && i - last > 1) pages.push("ellipsis-" + i);
        pages.push(i);
        last = i;
      }
    }
    return pages;
  }

  function initListing() {
    var root = document.querySelector("[data-catalog-listing]");
    if (!root) return;

    var controls = {
      search: document.getElementById("catalogSearch"),
      suggestions: document.getElementById("catalogSearchSuggestions"),
      brand: document.getElementById("catalogBrand"),
      clear: document.getElementById("catalogClearFilters"),
      count: document.getElementById("catalogResultCount"),
      grid: document.getElementById("catalogGrid"),
      pagination: document.getElementById("catalogPagination"),
      empty: document.getElementById("catalogEmpty"),
      loading: document.getElementById("catalogLoading"),
      results: document.getElementById("catalogResults"),
      categoryTree: document.getElementById("catalogCategoryTree"),
      activeFilterText: document.getElementById("catalogActiveFilterText"),
      pageTitle: document.getElementById("catalogPageTitle"),
    };

    var params = new URLSearchParams(window.location.search);
    var selectedDepartment = createSlug(params.get("department"));
    var requestedBrandSlug = createSlug(params.get("brandSearch") || params.get("brand"));
    var state = {
      search: text(params.get("search") || params.get("query")),
      departmentSlug: selectedDepartment,
      categorySlug: createSlug(params.get("category")),
      brandSlug: requestedBrandSlug,
      page: Math.max(parseInt(params.get("page") || "1", 10) || 1, 1),
      pushHistory: false,
    };

    var allProducts = [];
    var hierarchy = [];
    var departmentBySlug = new Map();
    var categoryByPair = new Map();
    var brandBySlug = new Map();
    var searchSuggestions = [];
    var debounceTimer = null;
    var shouldScrollToResults = Boolean(state.departmentSlug || state.categorySlug || state.brandSlug || window.location.hash === "#catalogResults");

    function createBrandRecords(products) {
      var recordsBySlug = new Map();
      products.forEach(function (product) {
        var name = text(product.brand);
        var slug = createSlug(name);
        if (!name || !slug) return;
        if (!recordsBySlug.has(slug)) {
          recordsBySlug.set(slug, { name: name, slug: slug, count: 0 });
        }
        recordsBySlug.get(slug).count += 1;
      });
      return Array.from(recordsBySlug.values()).sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
    }

    function brandLabel(slug) {
      var record = brandBySlug.get(createSlug(slug));
      return record ? record.name : text(slug);
    }

    function resolveBrandSlug(value) {
      var requested = createSlug(value);
      if (!requested) return "";
      if (brandBySlug.has(requested)) return requested;
      var resolved = "";
      brandBySlug.forEach(function (brand, slug) {
        if (resolved) return;
        if (createSlug(brand.name) === requested || createSlug(slug) === requested) {
          resolved = slug;
        }
      });
      return resolved || requested;
    }

    function suggestionSearchText(record) {
      return [
        record.value,
        record.label,
        record.type,
        record.department,
        record.category,
        record.slug,
      ]
        .concat([record.value, record.label, record.department, record.category].map(createSlug))
        .map(text)
        .join(" ")
        .toLowerCase();
    }

    function addSuggestion(recordsByValue, value, type, extra) {
      var label = text(value);
      if (!label) return;
      var key = label.toLowerCase();
      if (recordsByValue.has(key)) return;
      recordsByValue.set(key, Object.assign({
        value: label,
        label: label,
        type: type,
        slug: createSlug(label),
      }, extra || {}));
    }

    function buildSearchSuggestions(products, departments, brands) {
      var recordsByValue = new Map();
      departments.forEach(function (department) {
        addSuggestion(recordsByValue, department.name, "Department", { slug: department.slug });
        (department.subcategories || []).forEach(function (category) {
          addSuggestion(recordsByValue, category.name, "Category", {
            slug: category.slug,
            department: department.name,
          });
        });
      });
      brands.forEach(function (brand) {
        addSuggestion(recordsByValue, brand.name, "Brand", { slug: brand.slug });
      });
      products.forEach(function (product) {
        addSuggestion(recordsByValue, product.productName, "Product", {
          department: product.department,
          category: product.category,
        });
      });
      return Array.from(recordsByValue.values());
    }

    function updateSearchSuggestions() {
      if (!controls.suggestions) return;
      var query = controls.search.value;
      controls.search.setAttribute("aria-expanded", "false");
      if (!text(query)) {
        controls.suggestions.hidden = true;
        controls.suggestions.innerHTML = "";
        return;
      }
      var matches = searchSuggestions
        .filter(function (record) {
          return matchesSearchText(suggestionSearchText(record), query);
        })
        .slice(0, 12);

      controls.suggestions.innerHTML = matches.map(function (record, index) {
        var label = record.type + (record.department && record.type === "Category" ? " in " + record.department : "");
        return (
          '<button type="button" class="catalog-search-suggestion" role="option" data-suggestion="' +
          escapeHtml(record.value) +
          '" id="catalogSearchSuggestion' +
          index +
          '"><span>' +
          escapeHtml(record.value) +
          '</span><small>' +
          escapeHtml(label) +
          "</small></button>"
        );
      }).join("");
      controls.suggestions.hidden = matches.length === 0;
      controls.search.setAttribute("aria-expanded", String(matches.length > 0));
    }

    function syncStateFromUrl() {
      var currentParams = new URLSearchParams(window.location.search);
      state.search = text(currentParams.get("search") || currentParams.get("query"));
      state.departmentSlug = createSlug(currentParams.get("department"));
      state.categorySlug = createSlug(currentParams.get("category"));
      state.brandSlug = resolveBrandSlug(currentParams.get("brandSearch") || currentParams.get("brand"));
      state.page = Math.max(parseInt(currentParams.get("page") || "1", 10) || 1, 1);
      state.pushHistory = false;
      controls.search.value = state.search;
      controls.brand.value = brandBySlug.has(state.brandSlug) ? state.brandSlug : "";
      updateSearchSuggestions();
    }

    function activeDepartment() {
      return departmentBySlug.get(state.departmentSlug) || null;
    }

    function activeCategory(department) {
      if (!department || !state.categorySlug) return null;
      return categoryByPair.get(department.slug + "::" + state.categorySlug) || null;
    }

    function productMatchesDepartment(product, departmentSlug) {
      if (!departmentSlug) return true;
      var selected = createSlug(departmentSlug);
      return createSlug(product.departmentSlug) === selected || createSlug(product.department) === selected;
    }

    function productMatchesCategory(product, categorySlug) {
      if (!categorySlug) return true;
      var selected = createSlug(categorySlug);
      return createSlug(product.categorySlug) === selected || createSlug(product.category) === selected;
    }

    function productMatchesBrand(product, brandSlug) {
      if (!brandSlug) return true;
      return createSlug(product.brand) === createSlug(brandSlug);
    }

    function applyFilters() {
      return allProducts
        .filter(function (product) {
          if (!productMatchesDepartment(product, state.departmentSlug)) return false;
          if (!productMatchesCategory(product, state.categorySlug)) return false;
          if (!productMatchesBrand(product, state.brandSlug)) return false;
          if (state.search && !matchesSearchText(searchableText(product), state.search)) return false;
          return true;
        })
        .sort(function (a, b) {
          return text(a.productName).localeCompare(text(b.productName));
        });
    }

    function renderCategoryTree() {
      var counts = buildCounts(allProducts);
      var html = hierarchy
        .filter(function (department) {
          return counts.departments[department.slug] > 0;
        })
        .map(function (department) {
          var departmentCount = counts.departments[department.slug] || 0;
          var isActiveDepartment = state.departmentSlug === department.slug;
          var categories = (department.subcategories || [])
            .filter(function (category) {
              return counts.categories[department.slug + "::" + category.slug] > 0;
            })
            .map(function (category) {
              var categoryCount = counts.categories[department.slug + "::" + category.slug] || 0;
              var active = isActiveDepartment && state.categorySlug === category.slug;
              return (
                '<button type="button" class="catalog-category-button' +
                (active ? " active" : "") +
                '" data-department="' +
                escapeHtml(department.slug) +
                '" data-category="' +
                escapeHtml(category.slug) +
                '"><span>' +
                escapeHtml(category.name) +
                '</span><span class="catalog-count">' +
                categoryCount.toLocaleString() +
                "</span></button>"
              );
            })
            .join("");

          return (
            '<details class="catalog-department" ' +
            (isActiveDepartment || window.innerWidth >= 900 ? "open" : "") +
            '><summary><span>' +
            escapeHtml(department.name) +
            '</span><span class="catalog-count">' +
            departmentCount.toLocaleString() +
            '</span></summary><button type="button" class="catalog-department-button' +
            (isActiveDepartment && !state.categorySlug ? " active" : "") +
            '" data-department="' +
            escapeHtml(department.slug) +
            '"><span>All ' +
            escapeHtml(department.name) +
            '</span><span class="catalog-count">' +
            departmentCount.toLocaleString() +
            "</span></button>" +
            categories +
            "</details>"
          );
        })
        .join("");
      controls.categoryTree.innerHTML = html || '<p class="catalog-empty">No departments found.</p>';
    }

    function render() {
      var filtered = applyFilters();
      var totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
      var department = activeDepartment();
      var category = activeCategory(department);
      state.page = Math.min(Math.max(state.page, 1), totalPages);
      var start = (state.page - 1) * PAGE_SIZE;
      var pageProducts = filtered.slice(start, start + PAGE_SIZE);
      var filterParts = [];
      if (category) filterParts.push(department.name + " / " + category.name);
      else if (department) filterParts.push(department.name);
      else if (state.departmentSlug) filterParts.push("Department: " + state.departmentSlug);
      if (state.brandSlug) filterParts.push(brandLabel(state.brandSlug));
      if (state.search) filterParts.push('Search: "' + state.search + '"');
      var activeLabel = filterParts.length ? filterParts.join(" · ") : "All products";

      controls.activeFilterText.textContent = activeLabel;
      if (controls.pageTitle) {
        controls.pageTitle.textContent = filterParts.length
          ? "Products - " + activeLabel.replace(/^Search: /, "")
          : "Browse Hardware & Tools";
      }
      controls.count.textContent =
        filtered.length.toLocaleString() +
        " product" +
        (filtered.length === 1 ? "" : "s") +
        " found";
      controls.grid.innerHTML = pageProducts.map(function (product) {
        return createProductCard(product);
      }).join("");
      controls.empty.hidden = filtered.length > 0;

      controls.pagination.innerHTML =
        '<button type="button" class="catalog-page-button" data-page="' +
        (state.page - 1) +
        '"' +
        (state.page <= 1 ? " disabled" : "") +
        ">Previous</button>" +
        paginationPages(state.page, totalPages)
          .map(function (page) {
            if (String(page).indexOf("ellipsis") === 0) return '<span class="catalog-page-ellipsis">...</span>';
            return (
              '<button type="button" class="catalog-page-button' +
              (page === state.page ? " active" : "") +
              '" data-page="' +
              page +
              '"' +
              (page === state.page ? ' aria-current="page"' : "") +
              ">" +
              page +
              "</button>"
            );
          })
          .join("") +
        '<button type="button" class="catalog-page-button" data-page="' +
        (state.page + 1) +
        '"' +
        (state.page >= totalPages ? " disabled" : "") +
        ">Next</button>";

      renderCategoryTree();
      updateUrl(state);
    }

    function changeFilter() {
      state.search = text(controls.search.value);
      state.brandSlug = createSlug(controls.brand.value);
      state.page = 1;
      state.pushHistory = true;
      updateSearchSuggestions();
      render();
    }

    controls.search.value = state.search;
    controls.brand.value = state.brandSlug;

    controls.search.addEventListener("input", function () {
      updateSearchSuggestions();
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(changeFilter, 180);
    });
    controls.search.addEventListener("focus", updateSearchSuggestions);
    controls.search.addEventListener("blur", function () {
      window.setTimeout(function () {
        controls.suggestions.hidden = true;
        controls.search.setAttribute("aria-expanded", "false");
      }, 120);
    });

    function chooseSearchSuggestion(button) {
      controls.search.value = button.dataset.suggestion;
      controls.suggestions.hidden = true;
      controls.search.setAttribute("aria-expanded", "false");
      changeFilter();
      controls.search.focus();
    }

    controls.suggestions.addEventListener("pointerdown", function (event) {
      var button = event.target.closest("[data-suggestion]");
      if (!button) return;
      event.preventDefault();
      chooseSearchSuggestion(button);
    });
    controls.suggestions.addEventListener("click", function (event) {
      var button = event.target.closest("[data-suggestion]");
      if (!button) return;
      event.preventDefault();
      chooseSearchSuggestion(button);
    });
    controls.brand.addEventListener("change", changeFilter);
    controls.clear.addEventListener("click", function () {
      controls.search.value = "";
      controls.brand.value = "";
      state.search = "";
      state.brandSlug = "";
      state.departmentSlug = "";
      state.categorySlug = "";
      state.page = 1;
      state.pushHistory = true;
      updateSearchSuggestions();
      render();
    });
    controls.categoryTree.addEventListener("click", function (event) {
      var button = event.target.closest("[data-department]");
      if (!button) return;
      state.departmentSlug = text(button.dataset.department);
      state.categorySlug = text(button.dataset.category);
      state.page = 1;
      state.pushHistory = true;
      render();
      controls.results.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    controls.pagination.addEventListener("click", function (event) {
      var button = event.target.closest("[data-page]");
      if (!button || button.disabled) return;
      state.page = parseInt(button.dataset.page, 10) || 1;
      state.pushHistory = true;
      render();
      controls.results.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    window.addEventListener("popstate", function () {
      syncStateFromUrl();
      render();
    });

    var brandsTicker = document.getElementById("brandsTicker");
    if (brandsTicker) {
      brandsTicker.addEventListener("click", function (event) {
        var link = event.target.closest(".ticker-item");
        if (!link) return;
        var url = new URL(link.href, window.location.href);
        var brandSlug = resolveBrandSlug(url.searchParams.get("brandSearch") || url.searchParams.get("brand"));
        if (!brandSlug) return;
        event.preventDefault();
        controls.search.value = "";
        controls.brand.value = brandSlug;
        state.search = "";
        state.brandSlug = brandSlug;
        state.departmentSlug = "";
        state.categorySlug = "";
        state.page = 1;
        state.pushHistory = true;
        updateSearchSuggestions();
        render();
        controls.results.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    Promise.all([loadProducts(), loadHierarchy()])
      .then(function (values) {
        allProducts = values[0];
        var departmentSlugResult = slugUtils.createUniqueSlugRecords(values[1], {
          nameKey: "name",
          slugKey: "slug",
          fallbackPrefix: "department",
        });
        hierarchy = departmentSlugResult.records.map(function (department) {
          var categorySlugResult = slugUtils.createUniqueSlugRecords(department.subcategories || [], {
            nameKey: "name",
            slugKey: "slug",
            fallbackPrefix: department.slug + "-category",
          });
          department.subcategories = categorySlugResult.records;
          return department;
        });

        departmentBySlug = new Map();
        categoryByPair = new Map();
        hierarchy.forEach(function (department) {
          departmentBySlug.set(department.slug, department);
          (department.subcategories || []).forEach(function (category) {
            categoryByPair.set(department.slug + "::" + category.slug, category);
          });
        });

        var brandRecords = createBrandRecords(allProducts);
        brandBySlug = new Map(brandRecords.map(function (brand) {
          return [brand.slug, brand];
        }));

        if (state.departmentSlug && !departmentBySlug.has(state.departmentSlug)) {
          var requestedDepartment = state.departmentSlug;
          var resolvedDepartment = hierarchy.find(function (department) {
            return createSlug(department.name) === requestedDepartment;
          });
          if (resolvedDepartment) state.departmentSlug = resolvedDepartment.slug;
        }

        if (state.categorySlug && !categoryByPair.has(state.departmentSlug + "::" + state.categorySlug)) {
          var requestedCategory = state.categorySlug;
          var resolvedPair = null;
          hierarchy.some(function (department) {
            if (!state.departmentSlug && createSlug(department.name) === requestedCategory) {
              resolvedPair = { departmentSlug: department.slug, categorySlug: "" };
              return true;
            }
            return (department.subcategories || []).some(function (category) {
              if (state.departmentSlug && department.slug !== state.departmentSlug) return false;
              if (createSlug(category.name) !== requestedCategory && category.slug !== requestedCategory) return false;
              resolvedPair = { departmentSlug: department.slug, categorySlug: category.slug };
              return true;
            });
          });
          if (resolvedPair) {
            state.departmentSlug = resolvedPair.departmentSlug;
            state.categorySlug = resolvedPair.categorySlug;
          }
        }

        brandRecords.forEach(function (brand) {
          controls.brand.insertAdjacentHTML("beforeend", '<option value="' + escapeHtml(brand.slug) + '">' + escapeHtml(brand.name) + "</option>");
        });
        searchSuggestions = buildSearchSuggestions(allProducts, hierarchy, brandRecords);

        state.brandSlug = resolveBrandSlug(state.brandSlug);
        if (state.brandSlug) state.search = "";
        controls.search.value = state.search;
        controls.brand.value = brandBySlug.has(state.brandSlug) ? state.brandSlug : "";
        updateSearchSuggestions();
        controls.loading.hidden = true;
        render();
        if (shouldScrollToResults) {
          window.setTimeout(function () {
            controls.results.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 80);
        }
      })
      .catch(function (error) {
        controls.loading.textContent = error.message;
        controls.loading.classList.add("catalog-error");
      });
  }

  function setMeta(name, content, property) {
    if (!content) return;
    var selector = property ? 'meta[property="' + name + '"]' : 'meta[name="' + name + '"]';
    var element = document.head.querySelector(selector);
    if (!element) {
      element = document.createElement("meta");
      if (property) element.setAttribute("property", name);
      else element.setAttribute("name", name);
      document.head.appendChild(element);
    }
    element.setAttribute("content", content);
  }

  function initDetail() {
    var root = document.querySelector("[data-product-detail]");
    if (!root) return;

    var params = new URLSearchParams(window.location.search);
    var id = text(params.get("id") || params.get("productId") || params.get("product") || params.get("sku"));
    var slug = text(params.get("slug") || params.get("amp;slug"));
    if (!id && !slug) {
      try {
        var storedRoute = JSON.parse(window.sessionStorage.getItem(LAST_PRODUCT_ROUTE_KEY) || "null");
        if (storedRoute) {
          id = text(storedRoute.id);
          slug = text(storedRoute.slug);
        }
      } catch (error) {
        id = "";
        slug = "";
      }
    }
    if (!slug && id && !/^\d+$/.test(id)) slug = id;

    function routeMatchesProduct(product) {
      var productId = text(product.productId);
      var productSlug = text(product.slug);
      var normalizedSlug = createSlug(slug);
      var normalizedProductName = createSlug(product.productName);
      return (
        (id && productId === id) ||
        (slug && productSlug === slug) ||
        (slug && productId === slug) ||
        (normalizedSlug && productSlug === normalizedSlug) ||
        (normalizedSlug && normalizedProductName === normalizedSlug)
      );
    }

    loadProducts()
      .then(function (products) {
        var product = products.find(routeMatchesProduct);

        if (!product) {
          root.innerHTML =
            '<div class="catalog-not-found"><h1>Product not found</h1><p>The product link may be outdated or the item is no longer available in the catalogue.</p><a class="btn-copper" href="products.html">Back to products</a></div>';
          document.title = "Product Not Found | AMCOL Hardware";
          return;
        }

        if (!window.location.search && (product.productId || product.slug)) {
          var routeParams = new URLSearchParams();
          if (product.productId) routeParams.set("id", product.productId);
          if (product.slug) routeParams.set("slug", product.slug);
          window.history.replaceState({}, "", "product-detail.html?" + routeParams.toString());
        }

        var title = text(product.seoTitle) || text(product.productName);
        var description = text(product.metaDescription) || text(product.description);
        var productUrl = window.location.href.split("#")[0];
        document.title = title + " | AMCOL Hardware";
        setMeta("description", description);
        setMeta("og:title", title, true);
        setMeta("og:description", description, true);
        if (product.imageUrl) setMeta("og:image", product.imageUrl, true);

        var canonical = document.head.querySelector('link[rel="canonical"]');
        if (!canonical) {
          canonical = document.createElement("link");
          canonical.rel = "canonical";
          document.head.appendChild(canonical);
        }
        canonical.href = productUrl;

        var details = [
          ["Brand", product.brand],
          ["Department", product.department],
          ["Category", product.category],
          ["Product ID", product.productId],
          ["Model", product.model],
        ].filter(function (row) {
          return text(row[1]);
        });

        var seenRelated = new Set();
        var related = [];
        function addRelated(predicate) {
          products.forEach(function (item) {
            if (related.length >= 4) return;
            if (item.productId === product.productId || seenRelated.has(item.productId) || !text(item.productName)) return;
            if (!predicate(item)) return;
            seenRelated.add(item.productId);
            related.push(item);
          });
        }
        addRelated(function (item) { return item.categorySlug === product.categorySlug && item.departmentSlug === product.departmentSlug; });
        addRelated(function (item) { return item.departmentSlug === product.departmentSlug; });

        var tags = Array.isArray(product.tags) ? product.tags.filter(Boolean) : [];
        var price = text(product.price)
          ? '<div class="catalog-detail-price">' + escapeHtml(product.price) + (text(product.currency) ? " " + escapeHtml(product.currency) : "") + "</div>"
          : "";
        var stock = text(product.stockStatus) ? '<div class="catalog-detail-stock">' + escapeHtml(product.stockStatus) + "</div>" : "";

        root.innerHTML =
          '<nav aria-label="breadcrumb" class="pdp-breadcrumb"><a href="index.html">Home</a> &gt; <a href="products.html">Products</a>' +
          (product.department ? ' &gt; <a href="' + listingHref({ departmentSlug: product.departmentSlug }) + '">' + escapeHtml(product.department) + "</a>" : "") +
          (product.category ? ' &gt; <a href="' + listingHref({ departmentSlug: product.departmentSlug, categorySlug: product.categorySlug }) + '">' + escapeHtml(product.category) + "</a>" : "") +
          " &gt; <span>" +
          escapeHtml(product.productName) +
          "</span></nav>" +
          '<div class="catalog-detail-grid"><div class="catalog-detail-image"><img src="' +
          escapeHtml(imageSrc(product)) +
          '" alt="' +
          escapeHtml(imageAlt(product)) +
          '" width="720" height="540" onerror="amcolProductImageError(this)"></div><div class="catalog-detail-info">' +
          (product.brand ? '<p class="pdp-brand-tag">' + escapeHtml(product.brand) + "</p>" : "") +
          '<h1 class="pdp-title">' +
          escapeHtml(product.productName) +
          "</h1>" +
          price +
          stock +
          (product.description ? '<div class="catalog-detail-description"><h2>Description</h2><p>' + escapeHtml(product.description) + "</p></div>" : "") +
          '<dl class="catalog-detail-specs">' +
          details.map(function (row) { return "<dt>" + escapeHtml(row[0]) + "</dt><dd>" + escapeHtml(row[1]) + "</dd>"; }).join("") +
          "</dl>" +
          (tags.length ? '<div class="catalog-detail-tags">' + tags.map(function (tag) { return "<span>" + escapeHtml(tag) + "</span>"; }).join("") + "</div>" : "") +
          '<a class="catalog-back-link" href="products.html">Back to products</a></div></div>' +
          (related.length
            ? '<section class="catalog-related"><h2>Related Products</h2><div class="catalog-grid compact">' + related.map(function (item) { return createProductCard(item, "compact"); }).join("") + "</div></section>"
            : "");

        var schema = {
          "@context": "https://schema.org",
          "@type": "Product",
          name: text(product.productName),
          sku: text(product.productId),
          description: description,
          category: text(product.category) || undefined,
          model: text(product.model) || undefined,
          image: text(product.imageUrl) || undefined,
          url: productUrl,
        };
        if (product.brand) schema.brand = { "@type": "Brand", name: product.brand };
        Object.keys(schema).forEach(function (key) {
          if (schema[key] === undefined || schema[key] === "") delete schema[key];
        });
        var script = document.createElement("script");
        script.type = "application/ld+json";
        script.text = JSON.stringify(schema);
        document.head.appendChild(script);
      })
      .catch(function (error) {
        root.innerHTML = '<div class="catalog-not-found"><h1>Catalogue unavailable</h1><p>' + escapeHtml(error.message) + "</p></div>";
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    document.addEventListener("click", function (event) {
      var link = event.target.closest(".catalog-card-link[data-product-id], .homepage-product-link[href*='product-detail']");
      if (!link) return;
      try {
        var href = new URL(link.getAttribute("href"), window.location.href);
        var route = {
          id: text(link.dataset.productId || href.searchParams.get("id")),
          slug: text(link.dataset.productSlug || href.searchParams.get("slug")),
        };
        if (route.id || route.slug) {
          window.sessionStorage.setItem(LAST_PRODUCT_ROUTE_KEY, JSON.stringify(route));
        }
      } catch (error) {
        return;
      }
    });
    initListing();
    initDetail();
  });
})();
