// Load environment variables first
const dotenv = require("dotenv");
const axios = require("axios");
const path = require("path")
const fs = require("fs");

// Local modules
const config = require("../../config/config.json");
const {sendSyncReport} = require("./emailSender")

// Load .env: use ENV_FILE_PATH if set, otherwise fallback to local .env
const envFilePath = process.env.ENV_FILE_PATH || "../../.env";
dotenv.config({ path: envFilePath });

// --- Helpers ---
function parseNumber(value) {
    if (typeof value === 'string') {
        return Number(value.replace(',', '.'));
    }
    return value; // already number
}

// Flatten categories helper
function flattenCategories(categoryTree) {
    if (!Array.isArray(categoryTree)) return undefined; // guard

    const result = [];

    function traverse(node, path = []) {
        if (!node || !node.tree_node_label) return; // skip invalid nodes

        const newPath = [...path, node.tree_node_label];

        if (!node.tree_node_list || !Array.isArray(node.tree_node_list) || node.tree_node_list.length === 0) {
            result.push({ category: newPath.length === 1 ? newPath[0] : newPath });
        } else {
            node.tree_node_list.forEach(child => traverse(child, newPath));
        }
    }

    categoryTree.forEach(node => traverse(node));
    return result;
}

// Format product list
function formatProductList(list) {
    return list.map((p) =>
        Object.fromEntries(
            Object.entries({
                count_code: p.count_code,
                code: p.code,
                barcode: p.barcode,
                name: p.name,
                unit: p.unit,
                service: p.service,
                sales: p.sales,
                activated: p.activated,
                purchasing: p.purchasing,
                eshop_sync: p.eshop_sync,
                height: parseNumber(p.height),
                width: parseNumber(p.width),
                depth: parseNumber(p.depth),
                weight: parseNumber(p.weight),
                // localization: p.localization,
                asset: p.asset,
                // lot_numbers: p.lot_numbers,
                norm: p.norm,
                // serial_numbers: p.serial_numbers,
                work: p.work,
                categories: flattenCategories(p.category_tree_list),
                name_desc: p.name_desc,
                customs_fee: p.customs_fee,
                country: p.country,
                koli_package_amount: p.koli_package_amount,
                gross_weight: parseNumber(p.gross_weight)
            }).filter(([_, v]) => v !== undefined)
        )
    );
}

function deepEqualIgnoreCaseUnordered(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    return a.toLowerCase() === b.toLowerCase();
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    
    // For each element in a, there must be a match in b
    return a.every(elA => b.some(elB => deepEqualIgnoreCaseUnordered(elA, elB)));
  }

  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every(k => deepEqualIgnoreCaseUnordered(a[k], b[k]));
  }

  return a === b;
}

// systemA is one that is treated as main --> it wins always
function generateSmartMerge(systemA, systemB, outputDir = './delta') {
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const mapA = Object.fromEntries(systemA.map(p => [p.code, p]));
    const mapB = Object.fromEntries(systemB.map(p => [p.code, p]));

    const changesB = []; // B needs to update to match A
    const changesA = []; // A can take non-conflicting fields from B
    let newInA = [];
    let newInB = [];

    for (const aProduct of systemA) {
        const bProduct = mapB[aProduct.code];

        if (!bProduct) {
            // Product only in A → add to B
            newInB.push({ ...aProduct });
            continue;
        }

        const bUpdate = {};
        const aUpdate = {};

        for (const key of new Set([...Object.keys(aProduct), ...Object.keys(bProduct)])) {
            if (key === 'count_code' || key === "sales" || key ==="service" || key === "purchasing" || key === "code") continue;
            
            const aValue = aProduct[key];
            const bValue = bProduct[key];

            const areObjects = typeof aValue === 'object' && aValue !== null &&
                typeof bValue === 'object' && bValue !== null;
            
            const equal = deepEqualIgnoreCaseUnordered(aValue, bValue);

            if (key === "categories" && !equal) {
                console.log(aValue, bValue, equal)
            }

            if (!equal) {
                if (aValue !== undefined && bValue !== undefined) {
                    bUpdate[key] = aValue; // A wins
                } else if (aValue === undefined && bValue !== undefined) {
                    aUpdate[key] = bValue; // Only B → add to A
                } else if (aValue !== undefined && bValue === undefined) {
                    bUpdate[key] = aValue; // Only A → add to B
                }
            }
        }

        // Push updates keeping original system count_code & service
        if (bUpdate && Object.keys(bUpdate).length > 0) {
            changesB.push({
                ...bUpdate,
                count_code: bProduct.count_code,
                sales: aProduct.sales,
                service: bProduct.service,
                purchasing: bProduct.purchasing,
                code: bProduct.code
            });
        }

        if (aUpdate && Object.keys(aUpdate).length > 0) {
            changesA.push({
                ...aUpdate,
                count_code: aProduct.count_code,
                sales: aProduct.sales,
                service: aProduct.service,
                purchasing: bProduct.purchasing, // double-check if this should be aProduct.purchase
                code: aProduct.code
            });
        }
    }

    // Products only in B → add to A
    for (const bProduct of systemB) {
        if (!mapA[bProduct.code]) {
            const { count_code, ...rest } = bProduct;
            newInA.push({ ...rest });
        }
    }

    // Products only in A → add to B
    for (const aProduct of systemA) {
        if (!mapB[aProduct.code]) {
            const { count_code, ...rest } = aProduct;
            newInB.push({ ...rest });
        }
    }

    fs.writeFileSync(`${outputDir}/changesA.json`, JSON.stringify(changesA, null, 2));
    fs.writeFileSync(`${outputDir}/changesB.json`, JSON.stringify(changesB, null, 2));
    fs.writeFileSync(`${outputDir}/newInA.json`, JSON.stringify(newInA, null, 2));
    fs.writeFileSync(`${outputDir}/newInB.json`, JSON.stringify(newInB, null, 2));

    console.log('✅ Smart merged delta files created in', outputDir);

    return { changesA, changesB, newInA, newInB };
}

// Update products in Metakocka
async function updateProducts(updates, secret_key, company_id) {
    const url = `${config.metakocka.baseUrl}${config.metakocka.productUpdatePath}`;
    const error_codes = [];

    for (const update of updates) {
        try {
            const res = await axios.post(
                url,
                {
                    secret_key,
                    company_id,
                    ...update
                },
                {
                    headers: { "Content-Type": "application/json" }
                }
            );

            if (res.data.opr_code !== "0") {
                error_codes.push({
                    opr_desc_app: res.data.opr_desc_app,
                    opr_desc: res.data.opr_desc
                });
            }
        } catch (err) {
            error_codes.push({
                update,
                error: err.response?.data || err.message
            });
        }
    }

    return error_codes;
}

async function addProducts(products, secret_key, company_id) {
    const url = `${config.metakocka.baseUrl}${config.metakocka.productAddPath}`;
    const error_codes = [];

    for (const product of products) {
        try {
            const res = await axios.post(
                url,
                {
                    secret_key,
                    company_id,
                    ...product
                },
                {
                    headers: { "Content-Type": "application/json" }
                }
            );

            if (res.data.opr_code !== "0") {
                error_codes.push({
                    opr_desc_app: res.data.opr_desc_app,
                    opr_desc: res.data.opr_desc
                });
            }
        } catch (err) {
            error_codes.push({
                product,
                error: err.response?.data || err.message
            });
        }
    }

    return error_codes;
}

async function listProducts(secret_key, company_id) {
    var productList = [];
    var offset = 0;
    var loop = true;
    const baseRequestData = {
        secret_key: secret_key,
        company_id: company_id,
        return_category: true,
        limit: 1000
    }

    while (loop) {
        const productListResponse = await axios.post(
            `${config.metakocka.baseUrl}${config.metakocka.productListPath}`,
            {
                ...baseRequestData,
                offset: offset
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );

        productList.push(...productListResponse.data.product_list)
        
        offset += 1000;

        if (productListResponse.data.product_list_count < 1000) {
            loop = false;
        }
    }
    return productList

}

async function syncProducts(systemAKey, systemACompany, systemBKey, systemBCompany) {
    const companyNames = {
        4430: "Creaglobe",
        6267: "Time 4 Action"
    }

    const productsA = await listProducts(systemAKey, systemACompany);
    const productsB = await listProducts(systemBKey, systemBCompany);

    const productsAFormated = formatProductList(productsA);
    const productsBFormated = formatProductList(productsB);

    const smartMerge = generateSmartMerge(productsAFormated, productsBFormated);

    const changesA = smartMerge.changesA;
    const changesB = smartMerge.changesB;
    const newInA = smartMerge.newInA;
    const newInB = smartMerge.newInB;

    const updateAErrorCodes = await updateProducts(changesA, systemAKey, systemACompany);
    const updateBErrorCodes = await updateProducts(changesB, systemBKey, systemBCompany);

    const addProductsAErrorCodes = await addProducts(newInA, systemAKey, systemACompany);
    const addProductsBErrorCodes = await addProducts(newInB, systemBKey, systemBCompany);

    // Correct email mapping: from → to based on data flow
    const emailTasks = [
        { errors: updateAErrorCodes, from: systemACompany, to: systemBCompany, notes: ['Product updates attempt'] },
        { errors: updateBErrorCodes, from: systemBCompany, to: systemACompany, notes: ['Product updates attempt'] },
        { errors: addProductsAErrorCodes, from: systemACompany, to: systemBCompany, notes: ['Adding new products'] },
        { errors: addProductsBErrorCodes, from: systemBCompany, to: systemACompany, notes: ['Adding new products'] },
    ];

    for (const task of emailTasks) {
        if (task.errors && task.errors.length > 0) {
            await sendSyncReport({
                toEmail: 'k2.gregar@gmail.com',
                fromSystem: companyNames[task.from],
                toSystem: companyNames[task.to],
                errors: task.errors,
                successes: [],
                notes: task.notes
            });
        }
    }

    console.log('All relevant error emails sent.');
}

// === TEST ===
// const creaglobeFormatted = formatProductList(creaglobe_product_list);
// const t4aFormatted = formatProductList(t4a_product_list); // simulate identical data


// var smartMerge = generateSmartMerge(creaglobeFormatted, t4aFormatted);

syncProducts(process.env.MK_SECRET_KEY_CREAGLOBE, process.env.MK_COMPANY_ID_CREAGLOBE, process.env.MK_SECRET_KEY_T4A, process.env.MK_COMPANY_ID_T4A)



// updateProducts(smartMerge.changesA, process.env.MK_SECRET_KEY_CREAGLOBE, process.env.MK_COMPANY_ID_CREAGLOBE)
// updateProducts(smartMerge.changesB, process.env.MK_SECRET_KEY_T4A, process.env.MK_COMPANY_ID_T4A)

