#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { createSlug } = require("./slug-utils");

const ROOT = path.resolve(__dirname, "..");
const REQUESTED_WORKBOOK = path.join(ROOT, "data", "amcol-products-website-ready.xlsx");
const FALLBACK_WORKBOOK = path.join(ROOT, "data", "amcol-products.xlsx");
const HIERARCHY_TXT = path.join(ROOT, "data", "category-hierarchy.txt");
const HIERARCHY_JSON = path.join(ROOT, "data", "category-hierarchy.json");
const WORKSHEET_NAME = "Website Products";
const PRODUCTS_JSON = path.join(ROOT, "data", "products.json");
const REPORT_JSON = path.join(ROOT, "data", "product-import-report.json");
const EXPECTED_PRODUCT_COUNT = 9266;

const EXPECTED_COLUMNS = [
  "Product ID",
  "Product Name",
  "Brand",
  "Category",
  "Description",
  "Model",
  "Price",
  "Currency",
  "Stock Status",
  "Image URL",
  "Product URL",
  "Source Page",
  "SEO Title",
  "Meta Description",
  "Alt Image Description",
  "Tags",
];

const CATEGORY_ALIASES = new Map([
  ["chest freezer", "Chest Freezers"],
  ["misc", "Miscellaneous"],
]);

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeBrandValue(value, productName) {
  const brand = clean(value);
  const name = clean(productName).toLowerCase();
  if (name.includes("black & decker") || name.includes("black and decker")) return "Black & Decker";
  if (name.startsWith("skil ") || name.includes(" skil ")) return "SKIL";
  return brand;
}

function normalizeKey(value) {
  return clean(value).toLowerCase();
}

function normalizeCategoryDisplay(value) {
  const text = clean(value);
  return CATEGORY_ALIASES.get(text.toLowerCase()) || text;
}

function normalizeProductId(value) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d+(\.0+)?$/.test(text)) return text.replace(/\.0+$/, "");
  return text;
}

function slugify(value) {
  return createSlug(value).slice(0, 140);
}

function parseTags(value) {
  const text = clean(value);
  if (!text) return [];
  const seen = new Set();
  return text
    .split(/[,;|]/)
    .map(clean)
    .filter(Boolean)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isValidHttpUrl(value) {
  const text = clean(value);
  if (!text) return false;
  const lower = text.toLowerCase();
  const invalidFragments = [
    "thumb450.jpg",
    "/thumb450",
    "placeholder",
    "no-image",
    "default-image",
    "data:image",
  ];
  if (invalidFragments.some((fragment) => lower.includes(fragment))) return false;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function pickWorkbook() {
  if (fs.existsSync(REQUESTED_WORKBOOK)) return REQUESTED_WORKBOOK;
  if (fs.existsSync(FALLBACK_WORKBOOK)) return FALLBACK_WORKBOOK;
  throw new Error(`Source workbook not found. Expected ${path.relative(ROOT, REQUESTED_WORKBOOK)}.`);
}

function isBulletLine(line) {
  return /^\s*(?:•|â€¢|-|\*)\s*/.test(line);
}

function stripBullet(line) {
  return line.replace(/^\s*(?:•|â€¢|-|\*)\s*/, "");
}

function parseHierarchyText() {
  if (!fs.existsSync(HIERARCHY_TXT)) {
    throw new Error("data/category-hierarchy.txt is required.");
  }

  const departments = [];
  const duplicateHierarchyEntriesRemoved = [];
  let currentDepartment = null;
  let currentSeen = new Set();

  fs.readFileSync(HIERARCHY_TXT, "utf8")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = clean(rawLine);
      if (!line || /^_+$/.test(line)) return;

      if (!isBulletLine(rawLine)) {
        const name = normalizeCategoryDisplay(line);
        currentDepartment = {
          name,
          slug: slugify(name),
          subcategories: [],
        };
        departments.push(currentDepartment);
        currentSeen = new Set();
        return;
      }

      if (!currentDepartment) return;
      const name = normalizeCategoryDisplay(stripBullet(rawLine));
      if (!name || /^_+$/.test(name)) return;
      const key = normalizeKey(name);
      if (currentSeen.has(key)) {
        duplicateHierarchyEntriesRemoved.push({
          department: currentDepartment.name,
          subcategory: name,
          sourceLine: index + 1,
        });
        return;
      }
      currentSeen.add(key);
      currentDepartment.subcategories.push({
        name,
        slug: slugify(name),
      });
    });

  const miscIndex = departments.findIndex((department) => department.slug === "miscellaneous");
  if (miscIndex >= 0 && miscIndex !== departments.length - 1) {
    departments.push(departments.splice(miscIndex, 1)[0]);
  }
  if (miscIndex < 0) {
    departments.push({ name: "Miscellaneous", slug: "miscellaneous", subcategories: [] });
  }

  return { departments, duplicateHierarchyEntriesRemoved };
}

function createCategoryMatcher(departments) {
  const matches = new Map();
  departments.forEach((department) => {
    department.subcategories.forEach((subcategory) => {
      matches.set(normalizeKey(subcategory.name), {
        department: department.name,
        departmentSlug: department.slug,
        category: subcategory.name,
        categorySlug: subcategory.slug,
      });
    });
  });
  CATEGORY_ALIASES.forEach((display, alias) => {
    const match = matches.get(normalizeKey(display));
    if (match) matches.set(alias, match);
  });
  return matches;
}

function countBy(items, key) {
  const counts = new Map();
  for (const item of items) {
    const value = clean(item[key]);
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value, count]) => ({ value, count }));
}

function increment(map, key) {
  if (!key) return;
  map.set(key, (map.get(key) || 0) + 1);
}

function mapCategory(rawCategory, matcher, unmatchedCategories) {
  const original = clean(rawCategory);
  const normalized = normalizeCategoryDisplay(original);
  const match = matcher.get(normalizeKey(normalized));
  if (match) return match;

  if (original) unmatchedCategories.add(original);
  return {
    department: "Miscellaneous",
    departmentSlug: "miscellaneous",
    category: normalized || "Miscellaneous",
    categorySlug: slugify(normalized || "Miscellaneous"),
  };
}

function main() {
  const { departments, duplicateHierarchyEntriesRemoved } = parseHierarchyText();
  const categoryMatcher = createCategoryMatcher(departments);
  const sourceWorkbook = pickWorkbook();
  const workbook = XLSX.readFile(sourceWorkbook, { cellDates: false });
  const worksheet = workbook.Sheets[WORKSHEET_NAME];

  if (!worksheet) {
    throw new Error(`Worksheet "${WORKSHEET_NAME}" not found. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false,
    blankrows: false,
  });

  const missingColumns = EXPECTED_COLUMNS.filter(
    (column) => !Object.prototype.hasOwnProperty.call(rows[0] || {}, column)
  );
  if (missingColumns.length) throw new Error(`Missing expected columns: ${missingColumns.join(", ")}`);

  const products = [];
  const seenIds = new Map();
  const seenSlugs = new Map();
  const skippedRows = [];
  const duplicateProductIds = [];
  const duplicateSlugsResolved = [];
  const unmatchedCategories = new Set();
  const productCountByDepartment = new Map();
  const productCountBySubcategory = new Map();
  let rejectedThumb450Images = 0;
  let missingOrInvalidImages = 0;
  let missingCategoryValues = 0;
  let productsMappedToKnownDepartment = 0;
  let productsAssignedToMiscellaneous = 0;

  rows.forEach((row, index) => {
    const sourceRow = index + 2;
    const id = normalizeProductId(row["Product ID"]);
    const name = clean(row["Product Name"]);

    if (!id || !name) {
      skippedRows.push({ row: sourceRow, reason: !id ? "Missing Product ID" : "Missing Product Name" });
      return;
    }

    if (seenIds.has(id)) {
      duplicateProductIds.push({ productId: id, firstRow: seenIds.get(id), duplicateRow: sourceRow });
      skippedRows.push({ row: sourceRow, reason: `Duplicate Product ID ${id}` });
      return;
    }
    seenIds.set(id, sourceRow);

    const rawCategory = clean(row["Category"]);
    if (!rawCategory) missingCategoryValues += 1;
    const categoryInfo = mapCategory(rawCategory, categoryMatcher, unmatchedCategories);
    if (categoryInfo.departmentSlug === "miscellaneous" && !categoryMatcher.has(normalizeKey(normalizeCategoryDisplay(rawCategory)))) {
      productsAssignedToMiscellaneous += 1;
    } else {
      productsMappedToKnownDepartment += 1;
    }

    const rawImage = clean(row["Image URL"]);
    const imageRejectedForThumb450 = rawImage.toLowerCase().includes("thumb450.jpg") || rawImage.toLowerCase().includes("/thumb450");
    const imageUrl = isValidHttpUrl(rawImage) ? rawImage : "";
    if (!imageUrl) missingOrInvalidImages += 1;
    if (imageRejectedForThumb450) rejectedThumb450Images += 1;

    const baseSlug = slugify(`${name} ${id}`) || `product-${id}`;
    let slug = baseSlug;
    if (seenSlugs.has(slug)) {
      slug = `${baseSlug}-${id}`;
      duplicateSlugsResolved.push({ baseSlug, resolvedSlug: slug, productId: id });
    }
    seenSlugs.set(slug, id);

    increment(productCountByDepartment, categoryInfo.department);
    increment(productCountBySubcategory, `${categoryInfo.department} > ${categoryInfo.category}`);

    products.push({
      productId: id,
      productName: name,
      brand: normalizeBrandValue(row["Brand"], name),
      department: categoryInfo.department,
      departmentSlug: categoryInfo.departmentSlug,
      category: categoryInfo.category,
      categorySlug: categoryInfo.categorySlug,
      description: clean(row["Description"]),
      model: clean(row["Model"]),
      price: clean(row["Price"]),
      currency: clean(row["Currency"]),
      stockStatus: clean(row["Stock Status"]),
      imageUrl,
      productUrl: clean(row["Product URL"]),
      sourcePage: clean(row["Source Page"]),
      seoTitle: clean(row["SEO Title"]),
      metaDescription: clean(row["Meta Description"]),
      altImageDescription: clean(row["Alt Image Description"]),
      tags: parseTags(row["Tags"]),
      slug,
    });
  });

  const report = {
    sourceWorkbook: path.relative(ROOT, sourceWorkbook).replace(/\\/g, "/"),
    requestedWorkbook: path.relative(ROOT, REQUESTED_WORKBOOK).replace(/\\/g, "/"),
    worksheetSelected: WORKSHEET_NAME,
    rowsRead: rows.length,
    productsImported: products.length,
    expectedProductCount: EXPECTED_PRODUCT_COUNT,
    rowsSkipped: skippedRows.length,
    skippedRows,
    duplicateProductIds,
    duplicateProductNames: countBy(products, "productName"),
    duplicateSlugsResolved,
    mainDepartmentsDetected: departments.length,
    uniqueSubcategoriesDetected: departments.reduce((total, department) => total + department.subcategories.length, 0),
    duplicateHierarchyEntriesRemoved,
    productsMappedToKnownDepartment,
    productsAssignedToMiscellaneous,
    unmatchedCategoryNames: [...unmatchedCategories].sort((a, b) => a.localeCompare(b)),
    productCountByDepartment: Object.fromEntries(productCountByDepartment),
    productCountBySubcategory: Object.fromEntries(productCountBySubcategory),
    missingCategoryValues,
    missingBrands: products.filter((product) => !product.brand).length,
    missingCategories: products.filter((product) => !product.category).length,
    missingDescriptions: products.filter((product) => !product.description).length,
    missingOrInvalidImages,
    rejectedThumb450Images,
    importTimestamp: new Date().toISOString(),
  };

  fs.writeFileSync(HIERARCHY_JSON, `${JSON.stringify(departments, null, 2)}\n`);
  fs.writeFileSync(PRODUCTS_JSON, `${JSON.stringify(products, null, 2)}\n`);
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`);

  console.log("AMCOL product import complete");
  console.log(`Source workbook: ${report.sourceWorkbook}`);
  if (sourceWorkbook !== REQUESTED_WORKBOOK) {
    console.log(`Note: requested workbook was not found, used fallback ${report.sourceWorkbook}`);
  }
  console.log(`Worksheet: ${WORKSHEET_NAME}`);
  console.log(`Products imported: ${report.productsImported}`);
  console.log(`Main departments detected: ${report.mainDepartmentsDetected}`);
  console.log(`Unique subcategories detected: ${report.uniqueSubcategoriesDetected}`);
  console.log(`Duplicate hierarchy entries removed: ${duplicateHierarchyEntriesRemoved.length}`);
  console.log(`Products mapped: ${productsMappedToKnownDepartment}`);
  console.log(`Products assigned to Miscellaneous: ${productsAssignedToMiscellaneous}`);
  console.log(`Unmatched category names: ${report.unmatchedCategoryNames.length}`);
}

try {
  main();
} catch (error) {
  console.error(`Product import failed: ${error.message}`);
  process.exit(1);
}
