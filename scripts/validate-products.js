#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createSlug, createUniqueSlugRecords, SLUG_PATTERN } = require("./slug-utils");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_JSON = path.join(ROOT, "data", "products.json");
const HIERARCHY_JSON = path.join(ROOT, "data", "category-hierarchy.json");
const EXPECTED_PRODUCT_COUNT = 9266;
function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function hasInvalidImageUrl(value) {
  const text = clean(value);
  if (!text) return false;
  const lower = text.toLowerCase();
  if (
    lower.includes("thumb450.jpg") ||
    lower.includes("/thumb450") ||
    lower.includes("placeholder") ||
    lower.includes("no-image") ||
    lower.includes("default-image") ||
    lower.includes("data:image")
  ) {
    return true;
  }
  try {
    const url = new URL(text);
    return url.protocol !== "http:" && url.protocol !== "https:";
  } catch (error) {
    return true;
  }
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Invalid JSON in ${label}: ${error.message}`);
    process.exit(1);
  }
}

function duplicates(items, key) {
  const seen = new Map();
  const dupes = [];
  items.forEach((item, index) => {
    const value = clean(item[key]);
    if (!value) return;
    if (seen.has(value)) {
      dupes.push({ value, firstIndex: seen.get(value), duplicateIndex: index });
    } else {
      seen.set(value, index);
    }
  });
  return dupes;
}

function duplicateSubcategoriesWithinDepartment(hierarchy) {
  const duplicatesFound = [];
  hierarchy.forEach((department) => {
    const seen = new Set();
    (department.subcategories || []).forEach((subcategory) => {
      const key = clean(subcategory.name).toLowerCase();
      if (!key) return;
      if (seen.has(key)) {
        duplicatesFound.push({ department: department.name, subcategory: subcategory.name });
      }
      seen.add(key);
    });
  });
  return duplicatesFound;
}

function uniqueBrandRecords(products) {
  const bySlug = new Map();
  const duplicateNames = new Map();
  products.forEach((product, index) => {
    const name = clean(product.brand);
    const slug = createSlug(name);
    if (!name || !slug) return;
    if (!bySlug.has(slug)) {
      bySlug.set(slug, { name, slug, count: 0, indexes: [] });
    }
    const record = bySlug.get(slug);
    record.count += 1;
    record.indexes.push(index);
    if (record.name !== name) {
      if (!duplicateNames.has(slug)) duplicateNames.set(slug, new Set([record.name]));
      duplicateNames.get(slug).add(name);
    }
  });
  return {
    records: [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name)),
    duplicateDisplayGroups: [...duplicateNames.entries()].map(([slug, names]) => ({ slug, names: [...names] })),
  };
}

function main() {
  if (!fs.existsSync(PRODUCTS_JSON)) {
    console.error("data/products.json does not exist. Run npm run import:products first.");
    process.exit(1);
  }
  if (!fs.existsSync(HIERARCHY_JSON)) {
    console.error("data/category-hierarchy.json does not exist. Run npm run import:products first.");
    process.exit(1);
  }

  const products = readJson(PRODUCTS_JSON, "data/products.json");
  const hierarchy = readJson(HIERARCHY_JSON, "data/category-hierarchy.json");

  if (!Array.isArray(products)) {
    console.error("data/products.json must contain a JSON array.");
    process.exit(1);
  }
  if (!Array.isArray(hierarchy)) {
    console.error("data/category-hierarchy.json must contain a JSON array.");
    process.exit(1);
  }

  const duplicateProductIds = duplicates(products, "productId");
  const duplicateSlugs = duplicates(products, "slug");
  const duplicateHierarchySubcategories = duplicateSubcategoriesWithinDepartment(hierarchy);
  const remainingThumb450Urls = products.filter((product) => clean(product.imageUrl).toLowerCase().includes("thumb450"));
  const departmentSlugRecords = createUniqueSlugRecords(hierarchy, {
    nameKey: "name",
    slugKey: "slug",
    fallbackPrefix: "department",
  });
  const departmentsBySlug = new Map(departmentSlugRecords.records.map((department) => [department.slug, department]));
  const unknownDepartmentRefs = products.filter((product) => {
    const slug = createSlug(product.departmentSlug || product.department);
    return slug && !departmentsBySlug.has(slug);
  });
  const brandRecords = uniqueBrandRecords(products);

  const result = {
    totalProducts: products.length,
    expectedProducts: EXPECTED_PRODUCT_COUNT,
    duplicateProductIds: duplicateProductIds.length,
    duplicateSlugs: duplicateSlugs.length,
    blankProductNames: products.filter((product) => !clean(product.productName)).length,
    blankProductIds: products.filter((product) => !clean(product.productId)).length,
    missingDepartments: products.filter((product) => !clean(product.department)).length,
    missingDepartmentSlugs: products.filter((product) => !clean(product.departmentSlug)).length,
    missingCategories: products.filter((product) => !clean(product.category)).length,
    missingCategorySlugs: products.filter((product) => !clean(product.categorySlug)).length,
    invalidDepartmentSlugs: products.filter((product) => clean(product.departmentSlug) && !SLUG_PATTERN.test(clean(product.departmentSlug))).length,
    invalidCategorySlugs: products.filter((product) => clean(product.categorySlug) && !SLUG_PATTERN.test(clean(product.categorySlug))).length,
    duplicateSubcategoryFilterEntries: duplicateHierarchySubcategories.length,
    departmentsProcessed: departmentSlugRecords.records.length,
    uniqueDepartmentSlugs: new Set(departmentSlugRecords.records.map((department) => department.slug)).size,
    duplicateDepartmentNamesAfterNormalization: departmentSlugRecords.duplicateNames.length,
    duplicateDepartmentSlugCollisionsResolved: departmentSlugRecords.duplicateSlugCollisions.length,
    missingDepartmentNamesInHierarchy: departmentSlugRecords.missingNames.length,
    emptyDepartmentSlugsInHierarchy: departmentSlugRecords.emptySlugs.length,
    invalidDepartmentSlugsInHierarchy: departmentSlugRecords.invalidSlugs.length,
    productsReferringToUnknownDepartments: unknownDepartmentRefs.length,
    missingBrands: products.filter((product) => !clean(product.brand)).length,
    brandsProcessed: brandRecords.records.length,
    duplicateBrandDisplayGroupsAfterNormalization: brandRecords.duplicateDisplayGroups.length,
    duplicateBrandSlugs: 0,
    missingBrandNames: products.filter((product) => !clean(product.brand)).length,
    invalidBrandSlugs: brandRecords.records.filter((brand) => !SLUG_PATTERN.test(brand.slug)).length,
    productsReferringToUnknownBrands: 0,
    missingDescriptions: products.filter((product) => !clean(product.description)).length,
    missingImages: products.filter((product) => !clean(product.imageUrl)).length,
    invalidImageUrls: products.filter((product) => hasInvalidImageUrl(product.imageUrl)).length,
    remainingThumb450Urls: remainingThumb450Urls.length,
    missingSeoTitles: products.filter((product) => !clean(product.seoTitle)).length,
    missingMetaDescriptions: products.filter((product) => !clean(product.metaDescription)).length,
    missingAltImageDescriptions: products.filter((product) => !clean(product.altImageDescription)).length,
    productsAssignedToMiscellaneous: products.filter((product) => clean(product.departmentSlug) === "miscellaneous").length,
  };

  console.log("AMCOL product validation");
  Object.entries(result).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });

  if (departmentSlugRecords.duplicateNames.length) {
    console.warn("Duplicate department names after normalization:");
    departmentSlugRecords.duplicateNames.slice(0, 10).forEach((group) => {
      console.warn(`- ${group.slug}: ${group.entries.map((entry) => entry.name).join(", ")}`);
    });
  }
  if (departmentSlugRecords.duplicateSlugCollisions.length) {
    console.warn("Department slug collisions resolved:");
    departmentSlugRecords.duplicateSlugCollisions.slice(0, 10).forEach((collision) => {
      console.warn(`- ${collision.name}: ${collision.requestedSlug} -> ${collision.resolvedSlug}`);
    });
  }
  if (brandRecords.duplicateDisplayGroups.length) {
    console.warn("Brand display variants sharing one slug:");
    brandRecords.duplicateDisplayGroups.slice(0, 10).forEach((group) => {
      console.warn(`- ${group.slug}: ${group.names.join(", ")}`);
    });
  }
  if (unknownDepartmentRefs.length) {
    console.warn("Products referring to unknown departments:");
    unknownDepartmentRefs.slice(0, 10).forEach((product) => {
      console.warn(`- ${product.productId}: ${product.department} (${product.departmentSlug})`);
    });
  }

  const seriousErrors =
    products.length !== EXPECTED_PRODUCT_COUNT ||
    duplicateProductIds.length ||
    duplicateSlugs.length ||
    result.blankProductIds ||
    result.blankProductNames ||
    result.missingDepartments ||
    result.missingDepartmentSlugs ||
    result.missingCategories ||
    result.missingCategorySlugs ||
    result.invalidDepartmentSlugs ||
    result.invalidCategorySlugs ||
    result.duplicateSubcategoryFilterEntries ||
    result.productsReferringToUnknownDepartments ||
    result.invalidImageUrls ||
    result.remainingThumb450Urls;

  if (seriousErrors) {
    console.error("Validation failed because serious catalogue errors were found.");
    process.exit(1);
  }

  console.log("Validation passed. Miscellaneous category assignments are warnings, not fatal errors.");
}

main();
