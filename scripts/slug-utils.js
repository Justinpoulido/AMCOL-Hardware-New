(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.amcolSlugUtils = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function text(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function createSlug(value) {
    return text(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[™®©]/g, "")
      .trim()
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/\+/g, " ")
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeRegExp(value) {
    return text(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function createProductSlug(product) {
    var item = product || {};
    var productId = text(item.id || item.productId || item.product_id);
    var slugSource = text(item.slug || item.productSlug || item.productName || item.name);
    var slug = createSlug(slugSource);

    if (!productId) return slug;

    var idSuffixPattern = new RegExp("(-" + escapeRegExp(productId) + ")+$");
    slug = slug.replace(idSuffixPattern, "") || "product";
    var brandSlug = createSlug(item.brand);
    if (brandSlug && !new RegExp("(^|-)" + escapeRegExp(brandSlug) + "(-|$)").test(slug)) {
      slug += "-" + brandSlug;
    }
    return slug + "-" + productId;
  }

  function createProductUrl(product) {
    var slug = createProductSlug(product);
    return slug ? "/" + slug + ".html" : "product-detail.html";
  }

  function createLegacyProductUrl(product) {
    var item = product || {};
    var productId = text(item.id || item.productId || item.product_id);
    var slug = createProductSlug(item);
    var params = new URLSearchParams();
    if (productId) params.set("id", productId);
    if (slug) params.set("slug", slug);
    return "product-detail.html" + (params.toString() ? "?" + params.toString() : "");
  }

  function isValidSlug(value) {
    return SLUG_PATTERN.test(text(value));
  }

  function uniqueSlug(baseSlug, usedSlugs, fallbackPrefix) {
    var base = createSlug(baseSlug) || createSlug(fallbackPrefix) || "item";
    var slug = base;
    var index = 2;
    while (usedSlugs.has(slug)) {
      slug = base + "-" + index;
      index += 1;
    }
    usedSlugs.add(slug);
    return slug;
  }

  function createUniqueSlugRecords(items, options) {
    var settings = options || {};
    var nameKey = settings.nameKey || "name";
    var slugKey = settings.slugKey || "slug";
    var fallbackPrefix = settings.fallbackPrefix || "item";
    var usedSlugs = new Set();
    var nameGroups = new Map();
    var collisions = [];
    var missingNames = [];
    var emptySlugs = [];
    var invalidSlugs = [];

    var records = (Array.isArray(items) ? items : []).map(function (item, index) {
      var name = text(item && item[nameKey]);
      var requestedSlug = text(item && item[slugKey]);
      var normalizedName = createSlug(name);
      var generatedSlug = createSlug(name);
      var slug = requestedSlug && isValidSlug(requestedSlug) ? requestedSlug : generatedSlug;

      if (!name) missingNames.push({ index: index, item: item });
      if (!requestedSlug) emptySlugs.push({ index: index, name: name });
      if (requestedSlug && !isValidSlug(requestedSlug)) invalidSlugs.push({ index: index, name: name, slug: requestedSlug });

      if (!nameGroups.has(normalizedName)) nameGroups.set(normalizedName, []);
      nameGroups.get(normalizedName).push({ index: index, name: name });

      var resolvedSlug = uniqueSlug(slug || fallbackPrefix + "-" + (index + 1), usedSlugs, fallbackPrefix);
      if (slug && resolvedSlug !== slug) {
        collisions.push({ index: index, name: name, requestedSlug: slug, resolvedSlug: resolvedSlug });
      }

      var copy = {};
      Object.keys(item || {}).forEach(function (key) {
        copy[key] = item[key];
      });
      copy[slugKey] = resolvedSlug;
      return copy;
    });

    var duplicateNames = [];
    nameGroups.forEach(function (entries, normalizedName) {
      if (normalizedName && entries.length > 1) duplicateNames.push({ slug: normalizedName, entries: entries });
    });

    return {
      records: records,
      duplicateNames: duplicateNames,
      duplicateSlugCollisions: collisions,
      missingNames: missingNames,
      emptySlugs: emptySlugs,
      invalidSlugs: invalidSlugs,
    };
  }

  return {
    createSlug: createSlug,
    createProductSlug: createProductSlug,
    createProductUrl: createProductUrl,
    createLegacyProductUrl: createLegacyProductUrl,
    isValidSlug: isValidSlug,
    createUniqueSlugRecords: createUniqueSlugRecords,
    SLUG_PATTERN: SLUG_PATTERN,
  };
});
