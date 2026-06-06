import type { Product } from "../context/cart-context"

export const initialProducts: Product[] = [
  // Main Course
  { id: 1, name: "Beef Bulalo", price: 390, image: "https://images.unsplash.com/photo-1623689048105-a17b1e1936b8?w=400&h=400&fit=crop", category: "main-course" },
  { id: 2, name: "Beef Caldereta", price: 380, image: "https://images.unsplash.com/photo-1574653853027-5382a3d23a15?w=400&h=400&fit=crop", category: "main-course" },
  { id: 3, name: "Pork Pata Humba", price: 365, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop", category: "main-course" },
  { id: 4, name: "Pork Adobo", price: 380, image: "https://images.unsplash.com/photo-1626509653291-18d9a934b9db?w=400&h=400&fit=crop", category: "main-course" },
  { id: 5, name: "Chicken Cordon Bleu", price: 365, image: "https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=400&h=400&fit=crop", category: "main-course" },
  { id: 6, name: "Crispy Chicken Curry", price: 325, image: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=400&h=400&fit=crop", category: "main-course" },
  { id: 7, name: "Shrimp Tempura", price: 325, image: "https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=400&h=400&fit=crop", category: "main-course" },
  { id: 8, name: "Chopsuey", price: 310, image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400&h=400&fit=crop", category: "main-course" },
  { id: 9, name: "Stir Fry Vegetable", price: 280, image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop", category: "main-course" },

  // Appetizer
  { id: 10, name: "Sausage & Fries", price: 265, image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 11, name: "Pork Spring Roll (Lumpia Shanghai)", price: 265, image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 12, name: "Chicharon Bulaklak", price: 220, image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 13, name: "Chicken Dumplings Potsticker", price: 225, image: "https://images.unsplash.com/photo-1496116218417-1a781b1c416c?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 14, name: "Calamares Frito", price: 260, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 15, name: "Fish & Fries", price: 245, image: "https://images.unsplash.com/photo-1579208030886-b1c5a7c1b59a?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 16, name: "French Fries", price: 180, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=400&fit=crop", category: "appetizer" },
  { id: 17, name: "Bopis", price: 220, image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400&h=400&fit=crop", category: "appetizer" },

  // Pasta & Noodles
  { id: 18, name: "Bihon Guisado", price: 250, image: "https://images.unsplash.com/photo-1612929633738-8fe44f7ec841?w=400&h=400&fit=crop", category: "pasta-noodles" },
  { id: 19, name: "Pancit Bam-i", price: 260, image: "https://images.unsplash.com/photo-1617093727343-374698b1b08d?w=400&h=400&fit=crop", category: "pasta-noodles" },
  { id: 20, name: "Lomi (Good for 2-3 person)", price: 280, image: "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&h=400&fit=crop", category: "pasta-noodles" },
  { id: 21, name: "Seafood Marinara", price: 385, image: "https://images.unsplash.com/photo-1563379926898-05f4575a45d8?w=400&h=400&fit=crop", category: "pasta-noodles" },
  { id: 22, name: "Chicken Alfredo", price: 345, image: "https://images.unsplash.com/photo-1645112411341-6c4fd023714a?w=400&h=400&fit=crop", category: "pasta-noodles" },
  { id: 23, name: "Spaghetti Meatballs", price: 365, image: "https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=400&h=400&fit=crop", category: "pasta-noodles" },

  // Grill Diners Budget (Specials) - Includes Rice, Soup & Drinks
  { id: 24, name: "Chicken Diners Inasal", price: 149, image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 25, name: "Spare Ribs Diners", price: 169, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 26, name: "Grilled Pork Liempo", price: 179, image: "https://images.unsplash.com/photo-1529193591184-b1d58069ecdd?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 27, name: "Salisbury Steak", price: 189, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 28, name: "Classic Chicken Wings", price: 179, image: "https://images.unsplash.com/photo-1608039829572-9b5e13089a21?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 29, name: "Garlic Parmesan Wings", price: 199, image: "https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },
  { id: 30, name: "Buffalo Wings", price: 199, image: "https://images.unsplash.com/photo-1608039858788-667850f129f6?w=400&h=400&fit=crop", category: "grill-diners-budget", description: "Includes Rice, Soup & Drinks" },

  // All Day Breakfast Silog
  { id: 31, name: "Danggit Silog", price: 159, image: "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 32, name: "Bangus Silog", price: 159, image: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 33, name: "Crispy Chicken Silog", price: 169, image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 34, name: "Chicken Ham Silog", price: 159, image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 35, name: "Hotdog Silog", price: 149, image: "https://images.unsplash.com/photo-1587536849024-daaa4a417b16?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 36, name: "Tocino Silog", price: 169, image: "https://images.unsplash.com/photo-1432139509613-5c4255815697?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 37, name: "Longganisa Silog", price: 169, image: "https://images.unsplash.com/photo-1528607929212-2636ec44253e?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 38, name: "Sisig Silog", price: 179, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },
  { id: 39, name: "Tapa Silog", price: 179, image: "https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=400&fit=crop", category: "all-day-breakfast-silog" },

  // Combo Meals (On Hot Plate) - ₱230.00 each
  { id: 40, name: "Fried Chicken & Calamares", price: 230, image: "https://images.unsplash.com/photo-1562967914-608f82629710?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 41, name: "Fried Chicken & Lumpia", price: 230, image: "https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 42, name: "Fried Chicken & Sisig", price: 230, image: "https://images.unsplash.com/photo-1626645738196-c2a72c7a5445?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 43, name: "Fried Chicken & Stir Fry Veggies", price: 230, image: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 44, name: "Pork Sisig & Lumpia", price: 230, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 45, name: "Pork Sisig & Calamares", price: 230, image: "https://images.unsplash.com/photo-1599487488170-d11ec9c172f0?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },
  { id: 46, name: "Pork Sisig & Stir Fry Veggies", price: 230, image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400&h=400&fit=crop", category: "combo-meals", description: "2 kind meals, Java Rice, Sunny side up egg & Drinks" },

  // Special Set - ₱265.00 each
  { id: 47, name: "Set A: Salisbury & Fried Chicken", price: 265, image: "https://images.unsplash.com/photo-1600891964092-4316c288032e?w=400&h=400&fit=crop", category: "special-set" },
  { id: 48, name: "Set B: Salisbury & Pork Sisig", price: 265, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", category: "special-set" },
  { id: 49, name: "Set C: Salisbury & Spring Roll", price: 265, image: "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=400&h=400&fit=crop", category: "special-set" },

  // Snacks, Burger & Sub
  { id: 50, name: "Classic Cheese Burger", price: 345, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=400&fit=crop", category: "snacks-burger-sub" },
  { id: 51, name: "Crispy Chicken Burger", price: 325, image: "https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400&h=400&fit=crop", category: "snacks-burger-sub" },
  { id: 52, name: "Vegetable Burger", price: 325, image: "https://images.unsplash.com/photo-1520072959219-c595dc870360?w=400&h=400&fit=crop", category: "snacks-burger-sub" },
  { id: 53, name: "Chicken Sandwich", price: 285, image: "https://images.unsplash.com/photo-1553909489-cd47e0907980?w=400&h=400&fit=crop", category: "snacks-burger-sub" },
  { id: 54, name: "Tuna Melt Sandwich", price: 295, image: "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=400&h=400&fit=crop", category: "snacks-burger-sub" },
  { id: 55, name: "Grilled Cheese Sandwich", price: 320, image: "https://images.unsplash.com/photo-1528736235302-52922df5c122?w=400&h=400&fit=crop", category: "snacks-burger-sub" },

  // American Breakfast
  { id: 56, name: "American Breakfast", price: 380, image: "https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=400&h=400&fit=crop", category: "american-breakfast", description: "Egg, Sausage or Bacon, Hashbrown, Pancake or Waffle, Butter & Syrup" },

  // Continental Breakfast
  { id: 57, name: "Continental Breakfast", price: 380, image: "https://images.unsplash.com/photo-1525351484163-7529414344d8?w=400&h=400&fit=crop", category: "continental-breakfast", description: "Egg, Toast Bread or Waffle, Baked Beans, Sausage, Butter, Syrup or Jam" },

  // Side Order
  { id: 58, name: "Seafood Fried Rice Platter", price: 230, image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop", category: "side-order" },
  { id: 59, name: "Java Rice", price: 45, image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop", category: "side-order" },
  { id: 60, name: "Java Rice Platter", price: 180, image: "https://images.unsplash.com/photo-1516684732162-798a0062be99?w=400&h=400&fit=crop", category: "side-order" },
  { id: 61, name: "Plain Rice", price: 25, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&h=400&fit=crop", category: "side-order" },
  { id: 62, name: "Plain Rice Platter", price: 110, image: "https://images.unsplash.com/photo-1536304993881-ff6e9eefa2a6?w=400&h=400&fit=crop", category: "side-order" },
  { id: 63, name: "Garlic Rice", price: 35, image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=400&fit=crop", category: "side-order" },
  { id: 64, name: "Add on Egg", price: 35, image: "https://images.unsplash.com/photo-1482049016gy-d615fcbfc6baz?w=400&h=400&fit=crop", category: "side-order" },

  // Sizzlers
  { id: 65, name: "Sizzling Mixed Seafood", price: 385, image: "https://images.unsplash.com/photo-1579631542720-3a87824fff86?w=400&h=400&fit=crop", category: "sizzlers" },
  { id: 66, name: "Sizzling Pork Sisig", price: 290, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&h=400&fit=crop", category: "sizzlers" },

  // Salads
  { id: 67, name: "Chicken Caesar Salad", price: 380, image: "https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400&h=400&fit=crop", category: "salads" },
  { id: 68, name: "Grill Diners Salad", price: 380, image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=400&fit=crop", category: "salads" },

  // Desserts
  { id: 69, name: "Churros", price: 180, image: "https://images.unsplash.com/photo-1624371414361-e670edf4898a?w=400&h=400&fit=crop", category: "desserts" },
  { id: 70, name: "Leche Flan", price: 160, image: "https://images.unsplash.com/photo-1528975604071-b4dc52a2d18c?w=400&h=400&fit=crop", category: "desserts" },
  { id: 71, name: "Mais Con Yelo", price: 220, image: "https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&h=400&fit=crop", category: "desserts" },

  // Shakes
  { id: 72, name: "Mango Shake", price: 225, image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop", category: "shakes" },
  { id: 73, name: "Pineapple Shake", price: 225, image: "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop", category: "shakes" },
  { id: 74, name: "Watermelon Shake", price: 225, image: "https://images.unsplash.com/photo-1497534446932-c925b458314e?w=400&h=400&fit=crop", category: "shakes" },
  { id: 75, name: "Banana Shake", price: 200, image: "https://images.unsplash.com/photo-1553787499-6f9133242796?w=400&h=400&fit=crop", category: "shakes" },
  { id: 76, name: "Cucumber & Pineapple Shake", price: 230, image: "https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=400&fit=crop", category: "shakes" },
  { id: 77, name: "Oreo Shake", price: 230, image: "https://images.unsplash.com/photo-1572490122747-3968b75cc699?w=400&h=400&fit=crop", category: "shakes" },
  { id: 78, name: "Matcha Shake", price: 220, image: "https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=400&h=400&fit=crop", category: "shakes" },
  { id: 79, name: "Chocolate Shake", price: 200, image: "https://images.unsplash.com/photo-1541658016709-82535e94bc69?w=400&h=400&fit=crop", category: "shakes" },
  { id: 80, name: "Strawberry Shake", price: 200, image: "https://images.unsplash.com/photo-1579954115545-a95591f28bfc?w=400&h=400&fit=crop", category: "shakes" },
  { id: 81, name: "Buko Juice", price: 100, image: "https://images.unsplash.com/photo-1536657464919-892534f60d6e?w=400&h=400&fit=crop", category: "shakes" },

  // Beers
  { id: 82, name: "San Mig Light", price: 120, image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", category: "beers" },
  { id: 83, name: "San Mig Pilsen", price: 120, image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop", category: "beers" },
  { id: 84, name: "San Mig Apple", price: 120, image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop", category: "beers" },
  { id: 85, name: "Red Horse Stallion", price: 120, image: "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop", category: "beers" },
  { id: 86, name: "Smirnoff Mule", price: 120, image: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=400&h=400&fit=crop", category: "beers" },
  { id: 87, name: "Red Horse Litro", price: 160, image: "https://images.unsplash.com/photo-1571613316887-6f8d5cbf7ef7?w=400&h=400&fit=crop", category: "beers" },

  // Drinks
  { id: 88, name: "Mineral Water (500ml)", price: 35, image: "https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=400&h=400&fit=crop", category: "drinks" },
  { id: 89, name: "Mineral Water (1 Liter)", price: 65, image: "https://images.unsplash.com/photo-1560023907-5f339617ea30?w=400&h=400&fit=crop", category: "drinks" },
  { id: 90, name: "Coke Zero", price: 65, image: "https://images.unsplash.com/photo-1629203851122-3726ecdf080e?w=400&h=400&fit=crop", category: "drinks" },
  { id: 91, name: "Sprite", price: 65, image: "https://images.unsplash.com/photo-1625772299848-391b6a87d7b3?w=400&h=400&fit=crop", category: "drinks" },
  { id: 92, name: "Royal", price: 65, image: "https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=400&h=400&fit=crop", category: "drinks" },
  { id: 93, name: "Regular Coke", price: 65, image: "https://images.unsplash.com/photo-1554866585-cd94860890b7?w=400&h=400&fit=crop", category: "drinks" },
  { id: 94, name: "Chilled Mango Juice", price: 120, image: "https://images.unsplash.com/photo-1546173159-315724a31696?w=400&h=400&fit=crop", category: "drinks" },
  { id: 95, name: "Chilled Pineapple Juice", price: 120, image: "https://images.unsplash.com/photo-1589733955941-5eeaf752f6dd?w=400&h=400&fit=crop", category: "drinks" },

  // Beer Buckets (w/ free Sizzling Bopis)
  { id: 96, name: "San Mig Light Bucket", price: 700, image: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=400&h=400&fit=crop", category: "beer-buckets", description: "w/ free Sizzling Bopis" },
  { id: 97, name: "San Mig Pilsen Bucket", price: 700, image: "https://images.unsplash.com/photo-1535958636474-b021ee887b13?w=400&h=400&fit=crop", category: "beer-buckets", description: "w/ free Sizzling Bopis" },
  { id: 98, name: "San Mig Apple Bucket", price: 700, image: "https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400&h=400&fit=crop", category: "beer-buckets", description: "w/ free Sizzling Bopis" },
  { id: 99, name: "Red Horse Stallion Bucket", price: 700, image: "https://images.unsplash.com/photo-1566633806327-68e152aaf26d?w=400&h=400&fit=crop", category: "beer-buckets", description: "w/ free Sizzling Bopis" },
]
