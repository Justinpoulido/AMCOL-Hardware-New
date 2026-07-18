#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createSlug } = require("./slug-utils");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTS_JSON = path.join(ROOT, "data", "products.json");
const HIERARCHY_JSON = path.join(ROOT, "data", "category-hierarchy.json");
const HOMEPAGE_JSON = path.join(ROOT, "data", "homepage-departments.json");
const REPORT_JSON = path.join(ROOT, "data", "homepage-departments-report.json");
const PLACEHOLDER_IMAGE = "images/product-placeholder.svg";
const CATALOG_RESULTS_HASH = "#catalogResults";

const DISPLAY_DEPARTMENTS = [
  { slug: "building-materials", title: "Building Materials", categories: ["Roofing Materials", "Lumber & Plywood", "Concrete & Mortar", "Wall Materials", "Blocks"], keywords: ["concrete", "lumber", "drywall", "cement", "panel", "roof", "masonry", "plywood"], negativeKeywords: ["cutter", "battery", "drill", "saw", "tool"] },
  { slug: "hand-tools", title: "Hand Tools", categories: ["Axes, Sledges & Mauls", "Mechanics Tools", "Measuring & Calculation Tools", "Pliers", "Screwdrivers"], keywords: ["wrench", "pliers", "screwdriver", "hammer", "measure", "level", "socket", "clamp", "knife"] },
  { slug: "power-tools-and-accessories", title: "Power Tools", categories: ["Corded Power Tools", "Cordless Power Tools", "Drill Bits", "Saw Blades & Accessories", "Sanding & Grinding Accessories"], keywords: ["drill", "saw", "grinder", "sander", "battery", "blade", "bit", "tool", "compressor"] },
  { slug: "plumbing-supplies", title: "Plumbing Supplies", categories: ["Faucets", "Valves & Parts", "Pipe Fittings", "Pumps & Accessories", "Showerheads"], keywords: ["faucet", "valve", "pipe", "fitting", "pump", "toilet", "shower", "pvc"] },
  { slug: "electrical", title: "Electrical", categories: ["Batteries & Flashlights", "Switches, Outlets & Plugs", "Light Bulbs & Accessories", "Wire & Cable", "Circuit Breakers"], keywords: ["switch", "outlet", "wire", "breaker", "light", "bulb", "cable", "receptacle", "battery"] },
  { slug: "paint-and-painting-supplies", title: "Paint & Painting", categories: ["Paint", "Adhesive & Glue", "Caulk & Sealant", "Paint Applicators & Accessories", "Spray Paints"], keywords: ["paint", "brush", "roller", "caulk", "sealant", "stain", "primer", "spray", "adhesive"] },
  { slug: "lawn-and-garden", title: "Lawn & Garden", categories: ["Garden Hoses", "Sprinklers & Watering", "Garden Tools", "Planters", "Outdoor Power Equipment"], keywords: ["hose", "sprinkler", "garden", "planter", "trimmer", "mower", "nozzle", "soil"] },
  { slug: "hardware", title: "Hardware", categories: ["Builder's Hardware", "Cabinet & Drawer Hardware", "Fasteners", "Hinges", "Padlocks & Accessories"], keywords: ["lock", "hinge", "fastener", "screw", "bolt", "knob", "drawer", "padlock", "bracket"] },
  { slug: "cleaning-supplies", title: "Cleaning Supplies", categories: ["Cleaning Chemicals", "Cleaning Tools & Supplies", "Vacuums & Floor Care", "Janitorial Supplies"], keywords: ["cleaner", "mop", "broom", "brush", "vacuum", "towel", "soap", "disinfect"] },
  { slug: "housewares", title: "Housewares", categories: ["Appliances", "Kitchen Small Appliances", "Kitchen Supplies", "Food & Beverage Storage", "Trash Cans & Trash Bags"], keywords: ["appliance", "kitchen", "storage", "organizer", "freezer", "fan", "container", "household"] },
];

const BRAND_BOOSTS = new Map([
  ["stanley", 500],
  ["dewalt", 500],
  ["makita", 500],
  ["milwaukee", 500],
  ["black & decker", 480],
  ["black+decker", 480],
  ["moen", 460],
  ["ge", 420],
  ["3m", 420],
  ["gorilla", 420],
  ["dap", 410],
  ["loctite", 410],
  ["duracell", 390],
  ["energizer", 390],
  ["lysol", 380],
  ["rubbermaid", 380],
  ["whirlpool", 380],
  ["liberty", 360],
  ["amerock", 360],
  ["tolsen", 340],
  ["senco", 330],
  ["maglite", 330],
  ["eaton", 330],
  ["westinghouse", 330],
  ["coleman", 320],
  ["crc", 320],
  ["evo-stik", 310],
]);

const BRAND_STOPWORDS = new Set([
  "length",
  "lenght",
  "black",
  "white",
  "red",
  "blue",
  "green",
  "clear",
  "plastic",
  "wooden",
  "fiber",
  "fiberglass",
  "concrete",
  "roll",
  "box",
  "large",
  "small",
  "super",
  "clean",
  "liquid",
  "disposable",
  "circuit",
  "load",
  "flat",
  "bag",
  "clay",
  "vertical",
]);

function clean(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function departmentProductsHref(departmentSlug, categorySlug) {
  const params = new URLSearchParams();
  params.set("department", createSlug(departmentSlug));
  if (categorySlug) params.set("category", createSlug(categorySlug));
  return "products.html?" + params.toString() + CATALOG_RESULTS_HASH;
}

function cleanBrand(value) {
  const brand = clean(value);
  if (!brand) return "";
  const lower = brand.toLowerCase();
  if (BRAND_STOPWORDS.has(lower)) return "";
  if (/^\d/.test(brand)) return "";
  if (/^(?:\d+|[a-z]?\d)[/'". x-]/i.test(brand)) return "";
  return brand;
}

function inferredBrand(product) {
  const explicit = cleanBrand(product.brand);
  if (explicit) return explicit;
  const name = clean(product.productName).toLowerCase();
  const aliases = [
    [/\bblack\s*(?:&|and)\s*decker\b/, "Black & Decker"],
    [/\bdewalt\b/, "DeWalt"],
    [/\bmakita\b/, "Makita"],
    [/\bmilwaukee\b/, "Milwaukee"],
    [/\bstanley\b/, "Stanley"],
    [/\bmoen\b/, "Moen"],
    [/\bbosch\b/, "Bosch"],
    [/\bge\b/, "GE"],
    [/\bduracell\b/, "Duracell"],
    [/\benergizer\b/, "Energizer"],
    [/\blysol\b/, "Lysol"],
    [/\brubbermaid\b/, "Rubbermaid"],
    [/\bgorilla\b/, "Gorilla"],
    [/\bdap\b/, "DAP"],
    [/\bloctite\b/, "Loctite"],
    [/\b3m\b/, "3M"],
    [/\btolsen\b/, "Tolsen"],
    [/\bsenco\b/, "Senco"],
    [/\beaton\b/, "Eaton"],
    [/\bwestinghouse\b/, "Westinghouse"],
    [/\bcoleman\b/, "Coleman"],
    [/\bcrc\b/, "CRC"],
    [/\bevo-stik\b/, "Evo-Stik"],
  ];
  const found = aliases.find(([pattern]) => pattern.test(name));
  return found ? found[1] : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isValidImageUrl(value) {
  const text = clean(value);
  if (!text) return false;
  const lower = text.toLowerCase();
  const invalid = [
    "thumb450.jpg",
    "/thumb450",
    "placeholder",
    "no-image",
    "default-image",
    "data:image",
    "encrypted-tbn",
    "google.com/imgres",
    "googleusercontent.com",
    "bing.com/images",
    "duckduckgo.com",
    "yahoo.com/images",
  ];
  if (invalid.some((fragment) => lower.includes(fragment))) return false;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (/\b(w|width|h|height)=(?:[1-9]\d?|1\d\d)\b/i.test(url.search)) return false;
    return true;
  } catch (error) {
    return false;
  }
}

function buildBrandSummary(products) {
  const brands = new Map();
  products.forEach((product) => {
    const brand = inferredBrand(product);
    if (!brand) return;
    if (!brands.has(brand)) {
      brands.set(brand, {
        brand,
        productCount: 0,
        validImageCount: 0,
        departments: new Set(),
        categories: new Set(),
        exampleProducts: [],
      });
    }
    const stat = brands.get(brand);
    stat.productCount += 1;
    if (isValidImageUrl(product.imageUrl)) stat.validImageCount += 1;
    if (product.department) stat.departments.add(product.department);
    if (product.category) stat.categories.add(product.category);
    if (stat.exampleProducts.length < 5 && clean(product.productName)) {
      stat.exampleProducts.push(product.productName);
    }
  });

  return [...brands.values()]
    .map((stat) => ({
      brand: stat.brand,
      productCount: stat.productCount,
      validImageCount: stat.validImageCount,
      departmentCount: stat.departments.size,
      categories: [...stat.categories].slice(0, 8),
      exampleProducts: stat.exampleProducts,
      score: stat.productCount + stat.validImageCount * 3 + stat.departments.size * 12,
    }))
    .sort((a, b) => b.score - a.score || a.brand.localeCompare(b.brand));
}

function scoreProduct(product, target, brandScore) {
  const productText = [product.productName, product.category, product.tags && product.tags.join(" ")].map(clean).join(" ").toLowerCase();
  const categoryText = clean(product.category).toLowerCase();
  const brand = inferredBrand(product);
  let score = 0;
  score += brandScore ? Math.min(brandScore.score, 500) : 0;
  score += BRAND_BOOSTS.get(brand.toLowerCase()) || 0;
  if (brand) score += 100;
  if (clean(product.altImageDescription)) score += 30;
  if (clean(product.description)) score += 20;
  if ((target.categories || []).some((category) => categoryText === category.toLowerCase())) score += 260;
  target.keywords.forEach((keyword) => {
    if (productText.includes(keyword)) score += 35;
  });
  (target.negativeKeywords || []).forEach((keyword) => {
    if (productText.includes(keyword)) score -= 300;
  });
  if (clean(product.productName).length > 90) score -= 20;
  if (clean(product.imageUrl).includes("300x300")) score += 5;
  return score;
}

function makeAltText(product, target) {
  const existingAlt = clean(product.altImageDescription);
  if (existingAlt) return existingAlt;
  const brand = inferredBrand(product);
  return [brand, product.productName, "representing", target.title, "at AMCOL Hardware"].filter(Boolean).join(" ");
}

function selectDepartmentProduct(target, products, brandSummary, usedProductIds, usedImages) {
  const brandScores = new Map(brandSummary.map((brand) => [brand.brand, brand]));
  const departmentProducts = products
    .filter((product) => product.departmentSlug === target.slug)
    .filter((product) => clean(product.productName))
    .filter((product) => isValidImageUrl(product.imageUrl))
    .filter((product) => !usedProductIds.has(product.productId))
    .filter((product) => !usedImages.has(clean(product.imageUrl).toLowerCase()));
  const preferredCategories = new Set((target.categories || []).map((category) => category.toLowerCase()));
  const preferredProducts = departmentProducts.filter((product) => preferredCategories.has(clean(product.category).toLowerCase()));
  const pool = preferredProducts.length ? preferredProducts : departmentProducts;
  const candidates = pool
    .map((product) => ({
      product,
      score: scoreProduct(product, target, brandScores.get(inferredBrand(product))),
    }))
    .sort((a, b) => b.score - a.score || clean(a.product.productName).localeCompare(clean(b.product.productName)));

  if (candidates.length) {
    return { product: candidates[0].product, fallback: "" };
  }

  const unbranded = departmentProducts;

  if (unbranded.length) {
    return { product: unbranded[0], fallback: "Used unbranded product image from the department." };
  }

  return { product: null, fallback: "Used local placeholder because no valid department image was available." };
}

function main() {
  const products = readJson(PRODUCTS_JSON);
  const hierarchy = readJson(HIERARCHY_JSON);
  const departmentsBySlug = new Map(hierarchy.map((department) => [department.slug, department]));
  const brandSummary = buildBrandSummary(products);
  const usedProductIds = new Set();
  const usedImages = new Set();
  const selections = [];
  const reportSelections = [];

  DISPLAY_DEPARTMENTS.forEach((target) => {
    if (!departmentsBySlug.has(target.slug)) return;
    const department = departmentsBySlug.get(target.slug);
    const { product, fallback } = selectDepartmentProduct(target, products, brandSummary, usedProductIds, usedImages);

    if (!product) {
      selections.push({
        department: department.name,
        departmentSlug: department.slug,
        category: target.categories[0] || "",
        categorySlug: createSlug(target.categories[0] || ""),
        displayTitle: target.title,
        brand: "",
        productId: "",
        productName: "Products from " + department.name,
        imageUrl: PLACEHOLDER_IMAGE,
        altText: department.name + " products at AMCOL Hardware",
        link: departmentProductsHref(department.slug, target.categories[0] || ""),
        fallback,
      });
      reportSelections.push({ department: department.name, selectedProduct: "", brand: "", imageUrl: PLACEHOLDER_IMAGE, fallback });
      return;
    }

    usedProductIds.add(product.productId);
    usedImages.add(clean(product.imageUrl).toLowerCase());
    const selection = {
      department: department.name,
      departmentSlug: department.slug,
      category: clean(product.category),
      categorySlug: clean(product.categorySlug),
      displayTitle: target.title,
      brand: inferredBrand(product),
      productId: clean(product.productId),
      productName: clean(product.productName),
      imageUrl: clean(product.imageUrl),
      altText: makeAltText(product, target),
      link: departmentProductsHref(department.slug, product.categorySlug || product.category),
      fallback,
    };
    selections.push(selection);
    reportSelections.push({
      department: department.name,
      displayTitle: target.title,
      category: selection.category,
      categorySlug: selection.categorySlug,
      brand: selection.brand,
      productId: selection.productId,
      productName: selection.productName,
      imageUrl: selection.imageUrl,
      fallback,
    });
  });

  const report = {
    generatedAt: new Date().toISOString(),
    departmentsGenerated: selections.length,
    selectedDepartments: reportSelections,
    rankedBrandSummary: brandSummary.slice(0, 50).map((brand) => ({
      brand: brand.brand,
      productCount: brand.productCount,
      validImageCount: brand.validImageCount,
      departmentCount: brand.departmentCount,
      mainCategoriesRepresented: brand.categories,
      exampleProducts: brand.exampleProducts,
    })),
  };

  fs.writeFileSync(HOMEPAGE_JSON, JSON.stringify(selections, null, 2) + "\n");
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");

  console.log("Homepage department data generated");
  reportSelections.forEach((selection) => {
    console.log(`${selection.displayTitle || selection.department}: ${selection.brand || "Unbranded"} - ${selection.productName || "Placeholder"}`);
  });
  console.log(`Saved ${path.relative(ROOT, HOMEPAGE_JSON).replace(/\\/g, "/")}`);
}

try {
  main();
} catch (error) {
  console.error(`Homepage generation failed: ${error.message}`);
  process.exit(1);
}
