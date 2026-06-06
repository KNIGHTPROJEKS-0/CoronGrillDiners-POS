const { Pool } = require("pg");

const raw = process.env.DATABASE_URL;
const url = new URL(raw);
url.searchParams.delete("sslmode");
url.searchParams.delete("sslcert");
url.searchParams.delete("sslkey");
url.searchParams.delete("sslrootcert");

const pool = new Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: false } });

async function seed() {
  const client = await pool.connect();
  try {
    console.log("=== Seeding Supabase: Categories & Products ===\n");

    const categories = [
      { id: "main-course",              name: "Main Course",              order: 1  },
      { id: "appetizer",                name: "Appetizer",                order: 2  },
      { id: "pasta-noodles",            name: "Pasta & Noodles",          order: 3  },
      { id: "grill-diners-budget",      name: "Grill Diners Budget",      order: 4  },
      { id: "all-day-breakfast-silog",  name: "All Day Breakfast Silog",  order: 5  },
      { id: "combo-meals",              name: "Combo Meals",              order: 6  },
      { id: "special-set",              name: "Special Set",              order: 7  },
      { id: "snacks-burger-sub",        name: "Snacks, Burger & Sub",     order: 8  },
      { id: "american-breakfast",       name: "American Breakfast",       order: 9  },
      { id: "continental-breakfast",    name: "Continental Breakfast",    order: 10 },
      { id: "side-order",               name: "Side Order",               order: 11 },
      { id: "sizzlers",                 name: "Sizzlers",                 order: 12 },
      { id: "salads",                   name: "Salads",                   order: 13 },
      { id: "desserts",                 name: "Desserts",                 order: 14 },
      { id: "shakes",                   name: "Shakes",                   order: 15 },
      { id: "beers",                    name: "Beers",                    order: 16 },
      { id: "drinks",                   name: "Drinks",                   order: 17 },
      { id: "beer-buckets",             name: "Beer Buckets",             order: 18 },
    ];

    console.log("Seeding categories...");
    for (const c of categories) {
      await client.query(
        `INSERT INTO public.categories (id, name, display_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order`,
        [c.id, c.name, c.order]
      );
    }
    console.log(`  ✓ ${categories.length} categories inserted`);

    const products = [
      // Main Course
      { name: "Beef Bulalo",             price: 390, category: "main-course",             image: "https://images.unsplash.com/photo-1623689048105-a17b1e1936b8?w=400&h=400&fit=crop", desc: null },
      { name: "Beef Caldereta",          price: 380, category: "main-course",             image: "https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=400&h=400&fit=crop", desc: null },
      { name: "Pork Pata Humba",         price: 365, category: "main-course",             image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop", desc: null },
      { name: "Pork Adobo",              price: 380, category: "main-course",             image: "https://images.unsplash.com/photo-1626509653291-18d9a934b9db?w=400&h=400&fit=crop", desc: null },
      { name: "Chicken Cordon Bleu",     price: 365, category: "main-course",             image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop", desc: null },
      { name: "Crispy Chicken Curry",    price: 325, category: "main-course",             image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=400&fit=crop", desc: null },
      { name: "Shrimp Tempura",          price: 325, category: "main-course",             image: "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=400&h=400&fit=crop", desc: null },
      { name: "Chopsuey",                price: 310, category: "main-course",             image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop", desc: null },
      { name: "Stir Fry Vegetable",      price: 280, category: "main-course",             image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop", desc: null },
      // Appetizer
      { name: "Sausage & Fries",                    price: 265, category: "appetizer", image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop", desc: null },
      { name: "Pork Spring Roll (Lumpia Shanghai)", price: 265, category: "appetizer", image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop", desc: null },
      { name: "Chicharon Bulaklak",                 price: 220, category: "appetizer", image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop", desc: null },
      { name: "Chicken Dumplings Potsticker",       price: 225, category: "appetizer", image: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400&h=400&fit=crop", desc: null },
      { name: "Calamares Frito",                    price: 260, category: "appetizer", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop", desc: null },
      { name: "Fish & Fries",                       price: 245, category: "appetizer", image: "https://images.unsplash.com/photo-1579208030886-b1c5a7c1b59a?w=400&h=400&fit=crop", desc: null },
      { name: "French Fries",                       price: 180, category: "appetizer", image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop", desc: null },
      { name: "Bopis",                              price: 220, category: "appetizer", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop", desc: null },
      // Pasta & Noodles
      { name: "Bihon Guisado",              price: 250, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400&h=400&fit=crop", desc: null },
      { name: "Pancit Bam-i",               price: 260, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=400&h=400&fit=crop", desc: null },
      { name: "Lomi (Good for 2-3 person)", price: 280, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=400&fit=crop", desc: null },
      { name: "Seafood Marinara",           price: 385, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&h=400&fit=crop", desc: null },
      { name: "Chicken Alfredo",            price: 345, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400&h=400&fit=crop", desc: null },
      { name: "Spaghetti Meatballs",        price: 365, category: "pasta-noodles", image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop", desc: null },
      // Grill Diners Budget
      { name: "Chicken Diners Inasal", price: 149, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop", desc: "Includes Rice, Soup & Drinks" },
      { name: "Spare Ribs Diners",     price: 169, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop",    desc: "Includes Rice, Soup & Drinks" },
      { name: "Grilled Pork Liempo",   price: 179, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=400&fit=crop",  desc: "Includes Rice, Soup & Drinks" },
      { name: "Salisbury Steak",       price: 189, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop",  desc: "Includes Rice, Soup & Drinks" },
      { name: "Classic Chicken Wings", price: 179, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1608039829572-9b5e13089a21?w=400&h=400&fit=crop",  desc: "Includes Rice, Soup & Drinks" },
      { name: "Garlic Parmesan Wings", price: 199, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400&h=400&fit=crop",  desc: "Includes Rice, Soup & Drinks" },
      { name: "Buffalo Wings",         price: 199, category: "grill-diners-budget", image: "https://images.unsplash.com/photo-1608039858788-667850f129f6?w=400&h=400&fit=crop",  desc: "Includes Rice, Soup & Drinks" },
      // All Day Breakfast Silog
      { name: "Danggit Silog",        price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&h=400&fit=crop", desc: null },
      { name: "Bangus Silog",         price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop", desc: null },
      { name: "Crispy Chicken Silog", price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop", desc: null },
      { name: "Chicken Ham Silog",    price: 159, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", desc: null },
      { name: "Hotdog Silog",         price: 149, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1587536849024-daaa4a417b16?w=400&h=400&fit=crop", desc: null },
      { name: "Tocino Silog",         price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1432139509613-5c4255815697?w=400&h=400&fit=crop", desc: null },
      { name: "Longganisa Silog",     price: 169, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=400&h=400&fit=crop", desc: null },
      { name: "Sisig Silog",          price: 179, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", desc: null },
      { name: "Tapa Silog",           price: 179, category: "all-day-breakfast-silog", image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=400&fit=crop", desc: null },
      // Combo Meals
      { name: "Fried Chicken & Calamares",       price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=400&fit=crop",    desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Lumpia",          price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop",  desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Sisig",           price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop",  desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Fried Chicken & Stir Fry Veggies",price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=400&fit=crop", desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Lumpia",             price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop",  desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Calamares",          price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop",  desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      { name: "Pork Sisig & Stir Fry Veggies",  price: 230, category: "combo-meals", image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop",  desc: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
      // Special Set
      { name: "Set A: Salisbury & Fried Chicken", price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop", desc: null },
      { name: "Set B: Salisbury & Pork Sisig",    price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", desc: null },
      { name: "Set C: Salisbury & Spring Roll",   price: 265, category: "special-set", image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop", desc: null },
      // Snacks, Burger & Sub
      { name: "Classic Cheese Burger",   price: 345, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop", desc: null },
      { name: "Crispy Chicken Burger",   price: 325, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&h=400&fit=crop", desc: null },
      { name: "Vegetable Burger",        price: 325, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=400&fit=crop", desc: null },
      { name: "Chicken Sandwich",        price: 285, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop", desc: null },
      { name: "Tuna Melt Sandwich",      price: 295, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop", desc: null },
      { name: "Grilled Cheese Sandwich", price: 320, category: "snacks-burger-sub", image: "https://images.unsplash.com/photo-1528736235302-52922df5c122?w=400&h=400&fit=crop", desc: null },
      // American Breakfast
      { name: "American Breakfast",    price: 380, category: "american-breakfast",    image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=400&fit=crop", desc: "Egg, Sausage or Bacon, Hashbrown, Pancake or Waffle, Butter & Syrup" },
      // Continental Breakfast
      { name: "Continental Breakfast", price: 380, category: "continental-breakfast", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", desc: "Egg, Toast Bread or Waffle, Baked Beans, Sausage, Butter, Syrup or Jam" },
      // Side Order
      { name: "Seafood Fried Rice Platter", price: 230, category: "side-order", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop", desc: null },
      { name: "Java Rice",                  price: 45,  category: "side-order", image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop", desc: null },
      { name: "Java Rice Platter",          price: 180, category: "side-order", image: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=400&h=400&fit=crop", desc: null },
      { name: "Plain Rice",                 price: 25,  category: "side-order", image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop", desc: null },
      { name: "Plain Rice Platter",         price: 110, category: "side-order", image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop", desc: null },
      { name: "Garlic Rice",                price: 35,  category: "side-order", image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop", desc: null },
      { name: "Add on Egg",                 price: 35,  category: "side-order", image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", desc: null },
      // Sizzlers
      { name: "Sizzling Mixed Seafood", price: 385, category: "sizzlers", image: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=400&h=400&fit=crop", desc: null },
      { name: "Sizzling Pork Sisig",    price: 290, category: "sizzlers", image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", desc: null },
      // Salads
      { name: "Chicken Caesar Salad", price: 380, category: "salads", image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=400&fit=crop", desc: null },
      { name: "Grill Diners Salad",   price: 380, category: "salads", image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop", desc: null },
      // Desserts
      { name: "Churros",      price: 180, category: "desserts", image: "https://images.unsplash.com/photo-1624371414361-e670edf4898a?w=400&h=400&fit=crop", desc: null },
      { name: "Leche Flan",   price: 160, category: "desserts", image: "https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=400&h=400&fit=crop", desc: null },
      { name: "Mais Con Yelo",price: 220, category: "desserts", image: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&h=400&fit=crop", desc: null },
      // Shakes
      { name: "Mango Shake",                  price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop", desc: null },
      { name: "Pineapple Shake",               price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop", desc: null },
      { name: "Watermelon Shake",              price: 225, category: "shakes", image: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&h=400&fit=crop", desc: null },
      { name: "Banana Shake",                  price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1553787499-6f9133242796?w=400&h=400&fit=crop", desc: null },
      { name: "Cucumber & Pineapple Shake",    price: 230, category: "shakes", image: "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=400&fit=crop", desc: null },
      { name: "Oreo Shake",                    price: 230, category: "shakes", image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop", desc: null },
      { name: "Matcha Shake",                  price: 220, category: "shakes", image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400&h=400&fit=crop", desc: null },
      { name: "Chocolate Shake",               price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=400&h=400&fit=crop", desc: null },
      { name: "Strawberry Shake",              price: 200, category: "shakes", image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400&h=400&fit=crop", desc: null },
      { name: "Buko Juice",                    price: 100, category: "shakes", image: "https://images.unsplash.com/photo-1536657464919-892534f60d6e?w=400&h=400&fit=crop", desc: null },
      // Beers
      { name: "San Mig Light",    price: 120, category: "beers", image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", desc: null },
      { name: "San Mig Pilsen",   price: 120, category: "beers", image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop", desc: null },
      { name: "San Mig Apple",    price: 120, category: "beers", image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop", desc: null },
      { name: "Red Horse Stallion",price: 120, category: "beers", image: "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop", desc: null },
      { name: "Smirnoff Mule",    price: 120, category: "beers", image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop", desc: null },
      { name: "Red Horse Litro",  price: 160, category: "beers", image: "https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=400&h=400&fit=crop", desc: null },
      // Drinks
      { name: "Mineral Water (500ml)",  price: 35,  category: "drinks", image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop", desc: null },
      { name: "Mineral Water (1 Liter)",price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1560023907-5f339617ea30?w=400&h=400&fit=crop", desc: null },
      { name: "Coke Zero",              price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop", desc: null },
      { name: "Coke Regular",           price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop", desc: null },
      { name: "Sprite",                 price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&h=400&fit=crop", desc: null },
      { name: "Royal",                  price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?w=400&h=400&fit=crop", desc: null },
      { name: "Iced Tea (1 Pitcher)",   price: 220, category: "drinks", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop", desc: null },
      { name: "Iced Tea (glass)",       price: 65,  category: "drinks", image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=400&fit=crop", desc: null },
      { name: "Hot Coffee",             price: 80,  category: "drinks", image: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400&h=400&fit=crop", desc: null },
      { name: "Hot Chocolate",          price: 80,  category: "drinks", image: "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=400&h=400&fit=crop", desc: null },
      // Beer Buckets
      { name: "Beer Bucket (5 pcs)",  price: 550, category: "beer-buckets", image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", desc: null },
      { name: "Beer Bucket (10 pcs)", price: 999, category: "beer-buckets", image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop", desc: null },
    ];

    console.log("Seeding products...");
    for (const p of products) {
      await client.query(
        `INSERT INTO public.products (name, price, category, image_url, description, available)
         VALUES ($1, $2, $3, $4, $5, true)
         ON CONFLICT (name) DO UPDATE
           SET price = EXCLUDED.price,
               category = EXCLUDED.category,
               image_url = EXCLUDED.image_url,
               description = EXCLUDED.description,
               available = true`,
        [p.name, p.price, p.category, p.image, p.desc]
      );
    }
    console.log(`  ✓ ${products.length} products inserted`);

    const cats = await client.query("SELECT COUNT(*) FROM public.categories");
    const prods = await client.query("SELECT COUNT(*) FROM public.products");
    console.log(`\nFinal counts:`);
    console.log(`  Categories: ${cats.rows[0].count}`);
    console.log(`  Products:   ${prods.rows[0].count}`);
    console.log("\nSeed complete!");
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
