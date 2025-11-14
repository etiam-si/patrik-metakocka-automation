// Load environment variables first
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");

// Local modules
const config = require("../../config/config.json");

// Load .env: use ENV_FILE_PATH if set, otherwise fallback to local .env
const envFilePath = process.env.ENV_FILE_PATH || "../../.env";
dotenv.config({ path: envFilePath });

const creaglobe_product_list = require("../../db/products/cr_product_list").product_list;
const t4a_product_list = require("../../db/products/t4a_product_list.json").product_list;

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
                localization: p.localization,
                asset: p.asset,
                lot_numbers: p.lot_numbers,
                norm: p.norm,
                serial_numbers: p.serial_numbers,
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

// Deep diff for nested objects
function deepDiff(a, b) {
    const changes = {};

    for (const key of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
        const aValue = a[key];
        const bValue = b[key];

        if (typeof aValue === "object" && aValue !== null && typeof bValue === "object" && bValue !== null) {
            const nested = deepDiff(aValue, bValue);
            if (Object.keys(nested).length > 0) changes[key] = nested;
        } else if (aValue !== bValue) {
            changes[key] = aValue;
        }
    }

    return changes;
}

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
            const aValue = aProduct[key];
            const bValue = bProduct[key];

            const areObjects = typeof aValue === 'object' && aValue !== null &&
                typeof bValue === 'object' && bValue !== null;

            const equal = areObjects ? JSON.stringify(aValue) === JSON.stringify(bValue) : aValue === bValue;

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
        changesB.push({
            ...bUpdate,
            count_code: bProduct.count_code,
            service: bProduct.service,
            purchase: bProduct.purchase,
            code: bProduct.code
        });

        changesA.push({
            ...aUpdate,
            count_code: aProduct.count_code,
            service: aProduct.service,
            purchase: bProduct.purchase,
            code: aProduct.code
        });
    }

    // Products only in B → add to A
    for (const bProduct of systemB) {
        if (!mapA[bProduct.code]) newInA.push({ ...bProduct });
    }

    // Products only in A → add to B
    for (const aProduct of systemA) {
        if (!mapB[aProduct.code]) newInB.push({ ...aProduct });
    }

    fs.writeFileSync(`${outputDir}/changesA.json`, JSON.stringify(changesA, null, 2));
    fs.writeFileSync(`${outputDir}/changesB.json`, JSON.stringify(changesB, null, 2));
    fs.writeFileSync(`${outputDir}/newInA.json`, JSON.stringify(newInA, null, 2));
    fs.writeFileSync(`${outputDir}/newInB.json`, JSON.stringify(newInB, null, 2));

    console.log('✅ Smart merged delta files created in', outputDir);

    return { changesA, changesB, newInA, newInB };
}



// === TEST ===
const creaglobeFormatted = formatProductList(creaglobe_product_list);
const t4aFormatted = formatProductList(t4a_product_list); // simulate identical data

// console.log(creaglobeFormatted)

var smartMerge = generateSmartMerge(creaglobeFormatted, t4aFormatted);

async function updateProducts(updates, secret_key, company_id) {
    for (const update of updates) {
        const productUpdateResponse = await axios.post(
            `${config.metakocka.baseUrl}${config.metakocka.productUpdatePath}`,
            {
                "secret_key": secret_key,
                "company_id": company_id,
                ...update
            },
            {
                headers: {
                    "Content-Type": "application/json"
                }
            }
        );
        if (productUpdateResponse.data.opr_code == "0") {
            // console.log("OK")
        } else {
            console.log(productUpdateResponse.data)
        }
        // console.log(productUpdateResponse.data)
        // console.dir(
        //     {
        //         "secret_key": secret_key,
        //         "company_id": company_id,
        //         ...update
        //     },
        // {depth: null})
        // return 0;
        // console.log(`${config.metakocka.baseUrl}${config.metakocka.productUpdatePath}`)
        // return 0;

    }
}

// updateProducts(smartMerge.changesA, process.env.MK_SECRET_KEY_CREAGLOBE, process.env.MK_COMPANY_ID_CREAGLOBE)
// smartMerge.changesB[0].name_desc = "Grega Rotar";
// delete smartMerge.changesB[0].code
updateProducts(smartMerge.changesB, process.env.MK_SECRET_KEY_T4A, process.env.MK_COMPANY_ID_T4A)


function parseNumber(value) {
    if (typeof value === 'string') {
        return Number(value.replace(',', '.'));
    }
    return value; // already number
}