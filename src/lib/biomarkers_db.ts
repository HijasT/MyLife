// ── Biomarker Reference Database ─────────────────────────────────────────
// Sources: markwk/awesome-biomarkers (CC0), standard clinical ranges
// Ranges are general adult references — always defer to your lab's report.

export type BiomarkerRef = {
  name: string;
  aliases: string[];           // alternate names / short codes
  group: string;               // CBC, Lipids, Metabolic, etc.
  unit: string;
  refMin: number | null;
  refMax: number | null;
  oneLiner: string;
  description: string;
  highCauses: string;
  lowCauses: string;
  healthCategory: string[];
};

export const BIOMARKER_DB: BiomarkerRef[] = [
  // ── Complete Blood Count ─────────────────────────────────────────────
  { name:"RBC", aliases:["Red Blood Cell Count","Red Blood Cells"], group:"CBC", unit:"M/µL", refMin:4.5, refMax:5.9,
    oneLiner:"Red blood cell count — carries oxygen throughout the body.",
    description:"Red blood cells are made in the bone marrow and broken down in the spleen and liver. RBC count reflects overall oxygen-carrying capacity.",
    highCauses:"Dehydration, high testosterone, living at altitude, polycythemia vera.",
    lowCauses:"Iron, B6, B12 or folate deficiency, kidney dysfunction, chronic inflammation, anemia, blood loss.",
    healthCategory:["Blood Health"] },

  { name:"Hemoglobin", aliases:["HGB","Hgb","HB"], group:"CBC", unit:"g/dL", refMin:13.5, refMax:17.5,
    oneLiner:"Protein in red blood cells that delivers oxygen throughout the body.",
    description:"Hemoglobin is the iron-containing protein in red blood cells responsible for transporting oxygen from the lungs to tissues.",
    highCauses:"Dehydration, elevated testosterone, poor oxygen delivery, thiamin deficiency, insulin resistance.",
    lowCauses:"Anemia, liver disease, hypothyroidism, excessive exercise, protein deficiency, inflammation, deficiencies in Vit E, Mg, Zn, Cu, Se, B6, Vit A.",
    healthCategory:["Blood Health"] },

  { name:"Hematocrit", aliases:["HCT","Packed Cell Volume","PCV"], group:"CBC", unit:"%", refMin:41, refMax:53,
    oneLiner:"Percentage of blood volume composed of red blood cells.",
    description:"Hematocrit represents the proportion of red blood cells in blood. Low hematocrit often indicates anemia or blood loss.",
    highCauses:"Dehydration, elevated testosterone, polycythemia, altitude adaptation.",
    lowCauses:"Anemia, blood loss, liver disease, hypothyroidism, nutrient deficiencies (Vit E, Mg, Zn, Cu, B6).",
    healthCategory:["Blood Health"] },

  { name:"MCV", aliases:["Mean Corpuscular Volume"], group:"CBC", unit:"fL", refMin:80, refMax:100,
    oneLiner:"Average red blood cell size — helps classify types of anemia.",
    description:"MCV measures the average volume of a red blood cell. Values outside the normal range help identify whether anemia is related to iron or B12/folate.",
    highCauses:"B12 or folate deficiency (macrocytic), alcohol use, thiamin deficiency.",
    lowCauses:"Iron deficiency (microcytic), B6, Cu, Zn, Vit A deficiency.",
    healthCategory:["Blood Health"] },

  { name:"MCH", aliases:["Mean Corpuscular Hemoglobin"], group:"CBC", unit:"pg", refMin:27, refMax:33,
    oneLiner:"Average amount of hemoglobin per red blood cell.",
    description:"MCH measures the average weight of hemoglobin per red blood cell. It rises and falls similarly to MCV.",
    highCauses:"B12 or folate deficiency, alcohol use, hyperlipidemia.",
    lowCauses:"Iron deficiency, B6, Cu, Zn, Vit A deficiency.",
    healthCategory:["Blood Health"] },

  { name:"MCHC", aliases:["Mean Corpuscular Hemoglobin Concentration"], group:"CBC", unit:"g/dL", refMin:32, refMax:36,
    oneLiner:"Average hemoglobin concentration within red blood cells.",
    description:"MCHC indicates whether red blood cells are pale (hypochromic) or too dense (hyperchromic). Hypochromic cells often indicate iron deficiency.",
    highCauses:"Hereditary spherocytosis, severe dehydration.",
    lowCauses:"Iron deficiency anemia, thalassemia, lead poisoning.",
    healthCategory:["Blood Health"] },

  { name:"Platelets", aliases:["PLT","Platelet Count","Thrombocytes"], group:"CBC", unit:"K/µL", refMin:150, refMax:400,
    oneLiner:"Blood cells involved in clotting and vascular integrity.",
    description:"Platelets stop bleeding by clumping and forming plugs at injury sites. Both high and low counts carry cardiovascular and bleeding risks.",
    highCauses:"Iron deficiency anemia, collagen diseases, hemolytic anemia, blood loss, stress, infection, inflammation.",
    lowCauses:"Alcoholism, liver dysfunction, viral/bacterial infections, pernicious anemia, medications, autoimmune conditions.",
    healthCategory:["Blood Health"] },

  { name:"MPV", aliases:["Mean Platelet Volume"], group:"CBC", unit:"fL", refMin:7.5, refMax:12.5,
    oneLiner:"Average size of platelets — reflects platelet activity and production.",
    description:"MPV correlates with platelet function. Larger platelets are metabolically more active and associated with cardiovascular risk when elevated.",
    highCauses:"Increased platelet production (after loss/destruction), vascular disease, type 2 diabetes, Hashimoto's thyroiditis, some cancers.",
    lowCauses:"Aplastic anemia, cytotoxic drug therapy, underproduction of platelets.",
    healthCategory:["Blood Health"] },

  { name:"RDW", aliases:["Red Cell Distribution Width","Red Blood Cell Distribution Width"], group:"CBC", unit:"%", refMin:11.5, refMax:14.5,
    oneLiner:"Variation in red blood cell size — elevated suggests nutritional deficiency.",
    description:"RDW measures the range in size of red blood cells. High RDW with low MCV is classic for iron deficiency.",
    highCauses:"Iron, Vit A, copper, or zinc deficiency anemias; recent blood transfusion.",
    lowCauses:"Not clinically significant when low.",
    healthCategory:["Blood Health"] },

  { name:"WBC", aliases:["White Blood Cell Count","Leukocytes"], group:"CBC", unit:"K/µL", refMin:4.5, refMax:11.0,
    oneLiner:"Total white blood cell count — primary immune system marker.",
    description:"WBC count reflects overall immune activity. Persistent elevation or depression warrants further investigation.",
    highCauses:"Infection, inflammation, stress, leukemia, medications (steroids).",
    lowCauses:"Viral infections, bone marrow disorders, autoimmune conditions, chemotherapy.",
    healthCategory:["Blood Health","Immunity"] },

  { name:"Neutrophils", aliases:["Absolute Neutrophils","Neutrophil Count"], group:"CBC", unit:"K/µL", refMin:1.8, refMax:7.7,
    oneLiner:"Most abundant white blood cell — first responder to bacterial infection.",
    description:"Neutrophils are the primary defense against bacterial and fungal infections. They are the most common white blood cell type.",
    highCauses:"Bacterial infection, inflammation, steroid use, physical stress.",
    lowCauses:"Copper or B12/folate deficiency, viral infection, bone marrow suppression.",
    healthCategory:["Blood Health","Immunity"] },

  { name:"Lymphocytes", aliases:["Absolute Lymphocytes","Lymphocyte Count"], group:"CBC", unit:"K/µL", refMin:1.0, refMax:4.8,
    oneLiner:"Immune cells including T-cells, B-cells and Natural Killer cells.",
    description:"Lymphocytes are a type of white blood cell that includes T-cells (cell-mediated immunity), B-cells (antibody production), and NK cells.",
    highCauses:"Viral infections, Crohn's disease, autoimmune conditions, hypoadrenalism.",
    lowCauses:"Zinc deficiency, HIV, corticosteroid use, stress, autoimmune disease.",
    healthCategory:["Immunity"] },

  { name:"Monocytes", aliases:["Absolute Monocytes","Monocyte Count"], group:"CBC", unit:"K/µL", refMin:0.2, refMax:0.95,
    oneLiner:"White blood cells that become macrophages — important in chronic inflammation.",
    description:"Monocytes leave the bloodstream to become macrophages, which engulf and destroy pathogens and dead cells.",
    highCauses:"Inflammation, collagen disease (e.g. rheumatoid arthritis), ulcerative colitis, post-infection recovery.",
    lowCauses:"Bone marrow suppression, steroid use, hairy cell leukemia.",
    healthCategory:["Immunity"] },

  { name:"Eosinophils", aliases:["Absolute Eosinophils","Eosinophil Count"], group:"CBC", unit:"K/µL", refMin:0.0, refMax:0.5,
    oneLiner:"Immune cells activated in late-stage inflammation — elevated in allergies and parasites.",
    description:"Eosinophils are associated with allergic reactions and parasitic infections. They release substances that destroy parasites and contribute to inflammation.",
    highCauses:"Allergies, asthma, parasitic infection, hypoadrenalism, eczema, ulcerative colitis, Crohn's.",
    lowCauses:"Elevated cortisol, steroid use.",
    healthCategory:["Immunity"] },

  { name:"Basophils", aliases:["Absolute Basophils","Basophil Count"], group:"CBC", unit:"K/µL", refMin:0.0, refMax:0.1,
    oneLiner:"White blood cells involved in inflammation and hypersensitivity reactions.",
    description:"Basophils are the least common white blood cells and play a role in allergic responses and inflammation.",
    highCauses:"Inflammation, allergies, hemolytic anemia, hypothyroidism, leukemia.",
    lowCauses:"Hyperthyroidism, severe allergic reaction, steroid use.",
    healthCategory:["Immunity"] },

  // ── Lipids Panel ─────────────────────────────────────────────────────
  { name:"Total Cholesterol", aliases:["Cholesterol","Cholesterol Total"], group:"Lipids", unit:"mg/dL", refMin:null, refMax:200,
    oneLiner:"Total cholesterol — waxy substance essential for cell membranes and hormones.",
    description:"Cholesterol travels through the blood in carrier lipoproteins (HDL, LDL). It is a precursor to steroid hormones and bile salts. Optimal levels below 200 mg/dL.",
    highCauses:"Poor thyroid function, insulin resistance, blood glucose dysregulation, magnesium deficiency, dehydration, kidney disease, familial hypercholesterolemia.",
    lowCauses:"Liver dysfunction, oxidative stress, inflammation, malabsorption, anemia.",
    healthCategory:["Lipids / Heart Health","Cardiovascular Health"] },

  { name:"Triglycerides", aliases:["TG","TRIG","Triacylglycerols"], group:"Lipids", unit:"mg/dL", refMin:null, refMax:150,
    oneLiner:"Blood fat storage form — elevated levels increase cardiovascular risk.",
    description:"Triglycerides are the major storage form of fat. High levels are strongly associated with cardiovascular disease and metabolic syndrome. Must be fasting for accurate results.",
    highCauses:"Blood glucose dysregulation, diabetes, high-carb diet, poor thyroid function, kidney disease, alcohol.",
    lowCauses:"Fat malabsorption, low-carb diet, calorie restriction, potentially autoimmunity.",
    healthCategory:["Lipids / Heart Health"] },

  { name:"LDL", aliases:["LDL-C","LDL Cholesterol","Low-Density Lipoprotein"], group:"Lipids", unit:"mg/dL", refMin:null, refMax:100,
    oneLiner:"'Bad' cholesterol — elevated LDL increases risk of plaque buildup in arteries.",
    description:"LDL carries cholesterol from the liver to cells. Excess LDL can deposit in arterial walls, forming plaques that increase risk of heart attack and stroke.",
    highCauses:"Insulin resistance, poor thyroid function, kidney disease, familial hypercholesterolemia, saturated fat diet.",
    lowCauses:"Liver dysfunction, oxidative stress, malabsorption, extreme low-fat diet.",
    healthCategory:["Lipids / Heart Health","Cardiovascular Health"] },

  { name:"HDL", aliases:["HDL-C","HDL Cholesterol","High-Density Lipoprotein"], group:"Lipids", unit:"mg/dL", refMin:40, refMax:null,
    oneLiner:"'Good' cholesterol — helps clear excess cholesterol from arteries.",
    description:"HDL transports cholesterol from the body's tissues to the liver for elimination. Higher HDL is generally protective against cardiovascular disease.",
    highCauses:"Excessive exercise, inflammation (paradoxically), oxidative stress.",
    lowCauses:"Insulin resistance, sedentary lifestyle, obesity, trans fat diet, metabolic syndrome, smoking.",
    healthCategory:["Lipids / Heart Health","Cardiovascular Health"] },

  // ── Comprehensive Metabolic Panel ────────────────────────────────────
  { name:"Glucose", aliases:["Blood Sugar","Fasting Glucose","Blood Glucose"], group:"Metabolic", unit:"mg/dL", refMin:70, refMax:100,
    oneLiner:"Blood sugar level — primary marker for diabetes and insulin function.",
    description:"Glucose is the body's main energy source. Fasting glucose above 100 suggests pre-diabetes; above 126 suggests diabetes. Must be fasting for accurate results.",
    highCauses:"Diabetes (type 1 or 2), insulin resistance, elevated stress hormones, high-carb meal (if non-fasting).",
    lowCauses:"Excessive insulin, prolonged fasting, poor diet, adrenal insufficiency, reactive hypoglycemia.",
    healthCategory:["Metabolic Health"] },

  { name:"BUN", aliases:["Blood Urea Nitrogen","Urea Nitrogen"], group:"Metabolic", unit:"mg/dL", refMin:7, refMax:20,
    oneLiner:"Kidney function marker — elevated BUN can indicate dehydration or kidney stress.",
    description:"BUN measures nitrogen in the blood from urea, a waste product of protein metabolism processed by the kidneys. It reflects kidney function and protein intake.",
    highCauses:"Dehydration, poor kidney function, high protein diet, fatty liver, catabolic stress.",
    lowCauses:"Inadequate protein intake or malabsorption, liver disease, overhydration, B6 deficiency.",
    healthCategory:["Metabolic Health"] },

  { name:"Creatinine", aliases:["CRE","CREA","Serum Creatinine"], group:"Metabolic", unit:"mg/dL", refMin:0.7, refMax:1.3,
    oneLiner:"Byproduct of muscle metabolism — key kidney function indicator.",
    description:"Creatinine is a waste product from muscle creatine breakdown, filtered by the kidneys. Elevated creatinine often signals kidney impairment.",
    highCauses:"Kidney dysfunction, dehydration, excessive muscle mass or breakdown, hyperthyroidism, high meat intake.",
    lowCauses:"Low muscle mass, poor protein intake, pregnancy, low-meat diet.",
    healthCategory:["Metabolic Health"] },

  { name:"eGFR", aliases:["Estimated Glomerular Filtration Rate","GFR"], group:"Metabolic", unit:"mL/min/1.73m²", refMin:60, refMax:null,
    oneLiner:"Estimates how well kidneys are filtering blood — key kidney health marker.",
    description:"eGFR is calculated from creatinine, age, and sex to estimate kidney filtration rate. Values below 60 for 3+ months indicate chronic kidney disease.",
    highCauses:"Not clinically concerning when elevated.",
    lowCauses:"Chronic kidney disease, diabetes, hypertension, nephrotoxic drugs, dehydration.",
    healthCategory:["Metabolic Health"] },

  { name:"Sodium", aliases:["Na","Na+","Serum Sodium"], group:"Metabolic", unit:"mEq/L", refMin:136, refMax:145,
    oneLiner:"Electrolyte essential for nerve and muscle function — regulates fluid balance.",
    description:"Sodium is the main extracellular electrolyte. It regulates fluid balance, blood pressure, and nerve signal transmission.",
    highCauses:"Dehydration, hyperaldosteronism, excess sodium intake, diabetes insipidus.",
    lowCauses:"Elevated serum glucose, low cortisol, glycosuria, hypothyroidism, heart or kidney failure, excess water intake.",
    healthCategory:["Metabolic Health"] },

  { name:"Potassium", aliases:["K","K+","Serum Potassium"], group:"Metabolic", unit:"mEq/L", refMin:3.5, refMax:5.0,
    oneLiner:"Electrolyte critical for heart rhythm and muscle contraction.",
    description:"Potassium is the main intracellular electrolyte. It's essential for cardiac function — both very high and very low levels can cause dangerous heart arrhythmias.",
    highCauses:"Renal failure, hypoaldosteronism, acidosis, hemolysis, low insulin, hyperglycemia.",
    lowCauses:"Poor potassium intake, alkalosis, hyperaldosteronism, fluid loss, elevated insulin, magnesium deficiency.",
    healthCategory:["Metabolic Health","Cardiovascular Health"] },

  { name:"Chloride", aliases:["Cl","Cl-","Serum Chloride"], group:"Metabolic", unit:"mEq/L", refMin:98, refMax:107,
    oneLiner:"Electrolyte that maintains cellular equilibrium and stomach acid production.",
    description:"Chloride is a negatively charged electrolyte that works with sodium to maintain fluid balance and pH.",
    highCauses:"Kidney dysfunction, diarrhea, dehydration, hyperparathyroidism, hyperventilation.",
    lowCauses:"Vomiting, respiratory acidosis, metabolic alkalosis, hypoaldosteronism.",
    healthCategory:["Metabolic Health"] },

  { name:"Carbon Dioxide", aliases:["CO2","Bicarbonate","HCO3"], group:"Metabolic", unit:"mEq/L", refMin:23, refMax:29,
    oneLiner:"Measures blood bicarbonate — a surrogate for acid-base balance.",
    description:"CO2 in a metabolic panel represents bicarbonate, which acts as a buffer to maintain blood pH. It reflects respiratory and metabolic acid-base status.",
    highCauses:"Vomiting, metabolic alkalosis, hypoventilation (respiratory acidosis).",
    lowCauses:"Metabolic acidosis, hyperventilation, diarrhea.",
    healthCategory:["Metabolic Health"] },

  { name:"Calcium", aliases:["Ca","Serum Calcium","Ca2+"], group:"Metabolic", unit:"mg/dL", refMin:8.6, refMax:10.2,
    oneLiner:"Mineral essential for bone health, nerve signaling and muscle contraction.",
    description:"Calcium plays critical roles in bone structure, muscle contraction, nerve transmission, and blood clotting. It is tightly regulated by parathyroid hormone and Vitamin D.",
    highCauses:"Hyperparathyroidism, cancer, excess Vitamin D, adrenal insufficiency, alkalosis, kidney dysfunction.",
    lowCauses:"Poor intake or absorption, hypoparathyroidism, Vitamin D deficiency, magnesium deficiency.",
    healthCategory:["Bone and Muscle Health","Metabolic Health"] },

  { name:"Albumin", aliases:["ALB","Serum Albumin"], group:"Metabolic", unit:"g/dL", refMin:3.5, refMax:5.0,
    oneLiner:"Main blood protein made by the liver — reflects nutritional status and liver health.",
    description:"Albumin is the most abundant protein in blood plasma. It carries hormones, drugs, and fatty acids, and maintains osmotic pressure. Low albumin is a marker of malnutrition or liver disease.",
    highCauses:"Dehydration.",
    lowCauses:"Infection, inflammation, liver disease, kidney disease, malnutrition, Crohn's disease.",
    healthCategory:["Metabolic Health","Liver Health"] },

  { name:"ALT", aliases:["SGPT","Alanine Aminotransferase","Alanine Transaminase"], group:"Liver", unit:"U/L", refMin:null, refMax:40,
    oneLiner:"Liver enzyme — most specific marker for liver cell damage.",
    description:"ALT is found in highest concentrations in the liver. When liver cells are damaged, ALT is released into the bloodstream. Elevated ALT is a sensitive marker of liver injury.",
    highCauses:"Hepatocellular disease, fatty liver, alcohol use, medications, biliary issues, pancreatitis.",
    lowCauses:"B6 deficiency (ALT requires B6 as cofactor).",
    healthCategory:["Liver Health"] },

  { name:"AST", aliases:["SGOT","Aspartate Aminotransferase","Aspartate Transaminase"], group:"Liver", unit:"U/L", refMin:null, refMax:40,
    oneLiner:"Liver and heart enzyme — elevated with liver or muscle damage.",
    description:"AST is found in the liver, heart, and muscles. It's less specific than ALT for liver disease but is used together with ALT to assess liver health.",
    highCauses:"Hepatitis, liver cirrhosis, alcoholism, hypothyroidism, heart attack, muscle damage.",
    lowCauses:"B6 deficiency, elevated serum nitrogen.",
    healthCategory:["Liver Health"] },

  { name:"ALP", aliases:["Alkaline Phosphatase","Alk Phos"], group:"Liver", unit:"U/L", refMin:null, refMax:120,
    oneLiner:"Enzyme from liver, bone and kidneys — elevated in liver or bone disease.",
    description:"ALP is found in the liver, bone, kidneys, and intestines. Elevated ALP can indicate liver disease, bone disorders, or bile duct obstruction.",
    highCauses:"Liver obstruction, cirrhosis, gastrointestinal issues, hyperphosphatemia, hyperparathyroidism, bone disease.",
    lowCauses:"Zinc, magnesium, or Vitamin C deficiency.",
    healthCategory:["Liver Health","Bone and Muscle Health"] },

  { name:"Bilirubin", aliases:["Total Bilirubin","TBIL","Bilirubin Total"], group:"Liver", unit:"mg/dL", refMin:null, refMax:1.2,
    oneLiner:"Byproduct of red blood cell breakdown — elevated in liver or blood disorders.",
    description:"Bilirubin is produced when red blood cells break down. The liver processes it for excretion in bile. Elevated bilirubin causes jaundice and can indicate liver or blood disease.",
    highCauses:"Excess hemolysis, liver dysfunction, bile duct obstruction, Gilbert's Syndrome.",
    lowCauses:"Oxidative stress, zinc deficiency.",
    healthCategory:["Liver Health","Blood Health"] },

  { name:"GGT", aliases:["Gamma-Glutamyl Transferase","Gamma-GT"], group:"Liver", unit:"U/L", refMin:null, refMax:55,
    oneLiner:"Liver enzyme sensitive to alcohol use and bile duct problems.",
    description:"GGT is an enzyme found primarily in the liver, kidney, and pancreas. It is highly sensitive to alcohol consumption and bile duct dysfunction.",
    highCauses:"Biliary dysfunction, alcoholism, pancreatitis, oxidative stress, fatty liver.",
    lowCauses:"Hypothyroidism, magnesium deficiency.",
    healthCategory:["Liver Health"] },

  // ── Thyroid ───────────────────────────────────────────────────────────
  { name:"TSH", aliases:["Thyroid Stimulating Hormone","Thyrotropin"], group:"Thyroid", unit:"mIU/L", refMin:0.4, refMax:4.0,
    oneLiner:"Master thyroid regulator — primary screening test for thyroid disorders.",
    description:"TSH is released by the pituitary to stimulate the thyroid. High TSH usually means an underactive thyroid (hypothyroidism); low TSH suggests an overactive thyroid (hyperthyroidism).",
    highCauses:"Hypothyroidism, thyroiditis, iodine deficiency, pituitary tumors.",
    lowCauses:"Hyperthyroidism, Graves' disease, excess thyroid hormone supplementation, pituitary insufficiency.",
    healthCategory:["Metabolic Health"] },

  { name:"T4", aliases:["Free T4","FT4","Thyroxine","Free Thyroxine"], group:"Thyroid", unit:"ng/dL", refMin:0.8, refMax:1.8,
    oneLiner:"Main thyroid hormone — regulates metabolism, energy, and growth.",
    description:"T4 is the primary hormone produced by the thyroid gland. Most T4 is converted to the active form T3 in peripheral tissues. Free T4 is the unbound, active portion.",
    highCauses:"Hyperthyroidism, Graves' disease, acute thyroiditis, excess iodine.",
    lowCauses:"Hypothyroidism, iodine deficiency, pituitary failure.",
    healthCategory:["Metabolic Health"] },

  { name:"T3", aliases:["Free T3","FT3","Triiodothyronine","Free Triiodothyronine"], group:"Thyroid", unit:"pg/mL", refMin:2.3, refMax:4.2,
    oneLiner:"Active thyroid hormone — regulates metabolism at the cellular level.",
    description:"T3 is the biologically active form of thyroid hormone, mostly converted from T4 in peripheral tissues. It directly affects nearly every cell in the body.",
    highCauses:"Hyperthyroidism, T3 toxicosis, iodine excess.",
    lowCauses:"Hypothyroidism, severe illness, malnutrition, selenium deficiency.",
    healthCategory:["Metabolic Health"] },

  // ── Iron Studies ─────────────────────────────────────────────────────
  { name:"Iron", aliases:["Serum Iron","Fe"], group:"Iron", unit:"µg/dL", refMin:60, refMax:170,
    oneLiner:"Blood iron level — reflects iron available for red blood cell production.",
    description:"Serum iron measures iron bound to transferrin. By itself it is a poor marker of iron status — always interpret alongside ferritin and TIBC.",
    highCauses:"Hemochromatosis, hemolytic anemia, liver damage, B6 deficiency.",
    lowCauses:"Poor iron intake, poor absorption, chronic blood loss, chronic disease, infection.",
    healthCategory:["Blood Health","Vitamins and Minerals"] },

  { name:"Ferritin", aliases:["Serum Ferritin"], group:"Iron", unit:"ng/mL", refMin:30, refMax:400,
    oneLiner:"Iron storage protein — best single marker of body iron stores.",
    description:"Ferritin is the body's primary iron-storage protein and is the most reliable indicator of iron deficiency or overload. However, it is also an acute-phase reactant that rises with inflammation.",
    highCauses:"Hemochromatosis, inflammation, liver damage, hemolytic anemia.",
    lowCauses:"Iron deficiency, poor intake, poor absorption, chronic blood loss, chronic disease.",
    healthCategory:["Blood Health","Vitamins and Minerals"] },

  { name:"TIBC", aliases:["Total Iron Binding Capacity","Iron Binding Capacity"], group:"Iron", unit:"µg/dL", refMin:250, refMax:370,
    oneLiner:"Measures transferrin's capacity to carry iron — elevated in iron deficiency.",
    description:"TIBC reflects the blood's total capacity to bind iron, mainly through transferrin. In iron deficiency, more transferrin is produced, raising TIBC.",
    highCauses:"Iron deficiency, pregnancy, elevated estrogen.",
    lowCauses:"Anemia of chronic disease, chronic infection, liver dysfunction.",
    healthCategory:["Blood Health"] },

  // ── Vitamins & Minerals ───────────────────────────────────────────────
  { name:"Vitamin D", aliases:["25-Hydroxyvitamin D","Vitamin D 25-OH","25(OH)D","Vit D"], group:"Vitamins", unit:"ng/mL", refMin:30, refMax:100,
    oneLiner:"Sunshine vitamin — critical for bone health, immunity, and mood.",
    description:"Vitamin D is produced in the skin through sun exposure and regulates calcium absorption, immune function, and cell growth. Deficiency is common, especially in people with limited sun exposure.",
    highCauses:"Excessive Vitamin D supplementation, granulomatous diseases (rare).",
    lowCauses:"Limited sun exposure, poor dietary intake, malabsorption, obesity, kidney or liver disease.",
    healthCategory:["Vitamins and Minerals","Bone and Muscle Health"] },

  { name:"Vitamin B12", aliases:["B12","Cobalamin","Cyanocobalamin"], group:"Vitamins", unit:"pg/mL", refMin:200, refMax:900,
    oneLiner:"Essential vitamin for nerve function, DNA synthesis and red blood cells.",
    description:"Vitamin B12 is essential for nerve myelin formation, DNA synthesis, and red blood cell production. Deficiency causes neurological damage and megaloblastic anemia.",
    highCauses:"Liver disease, myeloproliferative disorders, high B12 supplementation.",
    lowCauses:"Vegan or vegetarian diet, pernicious anemia, malabsorption (IBS, celiac), gastric bypass surgery.",
    healthCategory:["Vitamins and Minerals","Blood Health","Brain and Body"] },

  { name:"Folate", aliases:["Folic Acid","Vitamin B9","Serum Folate"], group:"Vitamins", unit:"ng/mL", refMin:3.1, refMax:20.5,
    oneLiner:"B vitamin essential for DNA synthesis, cell division and fetal development.",
    description:"Folate is critical for DNA synthesis and repair, and for the production of red blood cells. Deficiency causes megaloblastic anemia and neural tube defects in pregnancy.",
    highCauses:"High folate supplementation, recent high folate food intake.",
    lowCauses:"Poor dietary intake (green vegetables, legumes), alcoholism, malabsorption, pregnancy, certain medications.",
    healthCategory:["Vitamins and Minerals","Blood Health"] },

  // ── Inflammatory Markers ──────────────────────────────────────────────
  { name:"CRP", aliases:["C-Reactive Protein","hsCRP","High-sensitivity CRP"], group:"Inflammation", unit:"mg/L", refMin:null, refMax:1.0,
    oneLiner:"Inflammation marker — elevated in infection, injury or chronic disease.",
    description:"CRP is produced by the liver in response to inflammation. High-sensitivity CRP (hsCRP) is used to assess cardiovascular risk. Elevated CRP indicates active inflammation but not its cause.",
    highCauses:"Bacterial infection, autoimmune disease, injury, cancer, cardiovascular disease, obesity, smoking.",
    lowCauses:"Not clinically significant when very low — indicates low inflammation.",
    healthCategory:["Cardiovascular Health","Immunity"] },

  { name:"ESR", aliases:["Erythrocyte Sedimentation Rate","Sed Rate"], group:"Inflammation", unit:"mm/hr", refMin:null, refMax:20,
    oneLiner:"Non-specific inflammation marker — elevated in many inflammatory conditions.",
    description:"ESR measures how quickly red blood cells settle in a tube. Inflammation causes proteins to coat red blood cells making them clump and settle faster.",
    highCauses:"Infection, inflammatory disease (RA, lupus), cancer, anemia, kidney disease.",
    lowCauses:"Polycythemia, sickle cell anemia, hyperviscosity syndromes.",
    healthCategory:["Immunity"] },

  // ── Hormones ─────────────────────────────────────────────────────────
  { name:"Testosterone", aliases:["Total Testosterone","Serum Testosterone"], group:"Hormones", unit:"ng/dL", refMin:300, refMax:1000,
    oneLiner:"Primary male sex hormone — important for muscle, bone, mood and libido.",
    description:"Testosterone is produced mainly in the testes (and in smaller amounts in the adrenal glands and ovaries in women). It affects muscle mass, bone density, fat distribution, mood, and sexual function.",
    highCauses:"Exogenous testosterone use, anabolic steroids, adrenal tumor, PCOS (in women).",
    lowCauses:"Hypogonadism, aging, obesity, chronic illness, stress, opioid use, pituitary disorders.",
    healthCategory:["Metabolic Health"] },

  { name:"Cortisol", aliases:["Serum Cortisol","AM Cortisol"], group:"Hormones", unit:"µg/dL", refMin:6, refMax:23,
    oneLiner:"Stress hormone — regulates metabolism, inflammation, and the stress response.",
    description:"Cortisol is produced by the adrenal glands and is essential for the stress response. It regulates blood sugar, metabolism, immune function, and the sleep-wake cycle.",
    highCauses:"Cushing's syndrome or disease, chronic stress, obesity, depression, pituitary tumor.",
    lowCauses:"Addison's disease, adrenal insufficiency, pituitary dysfunction, long-term steroid use (withdrawal).",
    healthCategory:["Metabolic Health"] },

  { name:"Insulin", aliases:["Fasting Insulin","Serum Insulin"], group:"Hormones", unit:"µIU/mL", refMin:2, refMax:25,
    oneLiner:"Hormone that regulates blood sugar — elevated levels suggest insulin resistance.",
    description:"Insulin is produced by the pancreas and allows cells to take up glucose from the blood. Chronically elevated fasting insulin is an early marker of insulin resistance and metabolic syndrome.",
    highCauses:"Insulin resistance, type 2 diabetes, obesity, high-carbohydrate diet, insulinoma.",
    lowCauses:"Type 1 diabetes, pancreatic damage, very low-calorie diet.",
    healthCategory:["Metabolic Health"] },

  // ── Diabetes Markers ──────────────────────────────────────────────────
  { name:"HbA1c", aliases:["Hemoglobin A1c","A1C","Glycated Hemoglobin","HBA1C"], group:"Diabetes", unit:"%", refMin:null, refMax:5.7,
    oneLiner:"3-month average blood sugar — key marker for diabetes diagnosis and control.",
    description:"HbA1c reflects average blood glucose over the past 2–3 months by measuring the percentage of hemoglobin coated with sugar. It is the gold standard for diabetes monitoring.",
    highCauses:"Type 1 or 2 diabetes, pre-diabetes, poor glucose control, iron deficiency anemia.",
    lowCauses:"Recent blood loss, hemolytic anemia, high red blood cell turnover.",
    healthCategory:["Metabolic Health"] },

  // ── Kidney ────────────────────────────────────────────────────────────
  { name:"Uric Acid", aliases:["Serum Uric Acid","Urate"], group:"Kidney", unit:"mg/dL", refMin:3.5, refMax:7.2,
    oneLiner:"End product of DNA metabolism — elevated levels associated with gout and cardiovascular risk.",
    description:"Uric acid is produced when the body breaks down purines. High levels can crystallize in joints (gout) and are associated with cardiovascular and kidney disease.",
    highCauses:"Gout, kidney dysfunction, excess alcohol, starvation, liver dysfunction, hemolytic anemia, high-protein diet, fructose.",
    lowCauses:"Molybdenum, zinc, or iron deficiency, low-purine diet, oxidative stress.",
    healthCategory:["Metabolic Health"] },

  // ── Cardiovascular ─────────────────────────────────────────────────
  { name:"Homocysteine", aliases:["Serum Homocysteine"], group:"Cardiovascular", unit:"µmol/L", refMin:null, refMax:15,
    oneLiner:"Amino acid — elevated levels damage blood vessels and raise heart disease risk.",
    description:"Homocysteine is an amino acid that, when elevated, damages blood vessel walls and promotes atherosclerosis. It is strongly associated with B vitamin status (B6, B12, folate).",
    highCauses:"B6, B12, or folate deficiency, kidney disease, hypothyroidism, genetic MTHFR variants.",
    lowCauses:"Not clinically significant when low.",
    healthCategory:["Cardiovascular Health"] },
];

// ── Lookup helpers ────────────────────────────────────────────────────────
export function findBiomarkerRef(name: string): BiomarkerRef | null {
  const q = name.trim().toLowerCase();
  return BIOMARKER_DB.find(b =>
    b.name.toLowerCase() === q ||
    b.aliases.some(a => a.toLowerCase() === q)
  ) ?? null;
}

export function searchBiomarkerRefs(query: string): BiomarkerRef[] {
  if (!query.trim()) return [];
  const q = query.trim().toLowerCase();
  return BIOMARKER_DB.filter(b =>
    b.name.toLowerCase().includes(q) ||
    b.aliases.some(a => a.toLowerCase().includes(q)) ||
    b.group.toLowerCase().includes(q)
  ).slice(0, 8);
}

export const BIOMARKER_GROUPS = [...new Set(BIOMARKER_DB.map(b => b.group))].sort();
