-- Seed categories
INSERT INTO categories (name, display_order) VALUES
  ('Chicken', 1),
  ('Pork', 2),
  ('Seafood', 3),
  ('Vegetables', 4),
  ('Beverages', 5),
  ('Extra', 6),
  ('Silog Meals', 7),
  ('Pulutan', 8)
ON CONFLICT (name) DO NOTHING;

-- Seed products with category references
-- Chicken
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Fried Chicken (Paa)', 65, (SELECT id FROM categories WHERE name = 'Chicken'), true, '/products/fried-chicken-paa.jpg'),
  ('Fried Chicken (Pecho)', 70, (SELECT id FROM categories WHERE name = 'Chicken'), true, '/products/fried-chicken-pecho.jpg'),
  ('Chicken Inasal (Paa)', 75, (SELECT id FROM categories WHERE name = 'Chicken'), true, '/products/chicken-inasal-paa.jpg'),
  ('Chicken Inasal (Pecho)', 85, (SELECT id FROM categories WHERE name = 'Chicken'), true, '/products/chicken-inasal-pecho.jpg'),
  ('Chicken BBQ', 20, (SELECT id FROM categories WHERE name = 'Chicken'), true, '/products/chicken-bbq.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Pork
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Pork BBQ', 15, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/pork-bbq.jpg'),
  ('Pork Sisig', 85, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/pork-sisig.jpg'),
  ('Pork Liempo (1/4)', 85, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/pork-liempo.jpg'),
  ('Pork Inihaw', 95, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/pork-inihaw.jpg'),
  ('Pork Sinigang', 120, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/pork-sinigang.jpg'),
  ('Lechon Kawali', 110, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/lechon-kawali.jpg'),
  ('Crispy Pata', 350, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/crispy-pata.jpg'),
  ('Tokwa''t Baboy', 75, (SELECT id FROM categories WHERE name = 'Pork'), true, '/products/tokwat-baboy.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Seafood
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Sinigang na Hipon', 180, (SELECT id FROM categories WHERE name = 'Seafood'), true, '/products/sinigang-hipon.jpg'),
  ('Fish Fillet', 120, (SELECT id FROM categories WHERE name = 'Seafood'), true, '/products/fish-fillet.jpg'),
  ('Grilled Bangus', 150, (SELECT id FROM categories WHERE name = 'Seafood'), true, '/products/grilled-bangus.jpg'),
  ('Calamares', 130, (SELECT id FROM categories WHERE name = 'Seafood'), true, '/products/calamares.jpg'),
  ('Shrimp Gambas', 180, (SELECT id FROM categories WHERE name = 'Seafood'), true, '/products/shrimp-gambas.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Vegetables
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Pinakbet', 85, (SELECT id FROM categories WHERE name = 'Vegetables'), true, '/products/pinakbet.jpg'),
  ('Chopsuey', 95, (SELECT id FROM categories WHERE name = 'Vegetables'), true, '/products/chopsuey.jpg'),
  ('Kangkong', 60, (SELECT id FROM categories WHERE name = 'Vegetables'), true, '/products/kangkong.jpg'),
  ('Ensaladang Talong', 55, (SELECT id FROM categories WHERE name = 'Vegetables'), true, '/products/ensaladang-talong.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Beverages
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Coke', 35, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/coke.jpg'),
  ('Coke Mismo', 25, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/coke-mismo.jpg'),
  ('Royal', 35, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/royal.jpg'),
  ('Sprite', 35, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/sprite.jpg'),
  ('Bottled Water', 20, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/water.jpg'),
  ('Iced Tea', 30, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/iced-tea.jpg'),
  ('San Mig Light', 55, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/san-mig-light.jpg'),
  ('Red Horse', 60, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/red-horse.jpg'),
  ('San Miguel Pilsen', 50, (SELECT id FROM categories WHERE name = 'Beverages'), true, '/products/san-mig-pilsen.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Extra
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Plain Rice', 15, (SELECT id FROM categories WHERE name = 'Extra'), true, '/products/plain-rice.jpg'),
  ('Garlic Rice', 25, (SELECT id FROM categories WHERE name = 'Extra'), true, '/products/garlic-rice.jpg'),
  ('Java Rice', 30, (SELECT id FROM categories WHERE name = 'Extra'), true, '/products/java-rice.jpg'),
  ('Extra Sauce', 10, (SELECT id FROM categories WHERE name = 'Extra'), true, '/products/extra-sauce.jpg'),
  ('Atchara', 20, (SELECT id FROM categories WHERE name = 'Extra'), true, '/products/atchara.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Silog Meals
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Tapsilog', 85, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/tapsilog.jpg'),
  ('Longsilog', 75, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/longsilog.jpg'),
  ('Tocilog', 75, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/tocilog.jpg'),
  ('Bangsilog', 95, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/bangsilog.jpg'),
  ('Chicksilog', 85, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/chicksilog.jpg'),
  ('Porksilog', 85, (SELECT id FROM categories WHERE name = 'Silog Meals'), true, '/products/porksilog.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;

-- Pulutan
INSERT INTO products (name, price, category_id, available, image_url) VALUES
  ('Chicharon Bulaklak', 95, (SELECT id FROM categories WHERE name = 'Pulutan'), true, '/products/chicharon-bulaklak.jpg'),
  ('Sisig', 95, (SELECT id FROM categories WHERE name = 'Pulutan'), true, '/products/sisig-pulutan.jpg'),
  ('Kilawin', 110, (SELECT id FROM categories WHERE name = 'Pulutan'), true, '/products/kilawin.jpg'),
  ('Dynamite Lumpia', 65, (SELECT id FROM categories WHERE name = 'Pulutan'), true, '/products/dynamite.jpg'),
  ('Crispy Tenga', 85, (SELECT id FROM categories WHERE name = 'Pulutan'), true, '/products/crispy-tenga.jpg')
ON CONFLICT (name) DO UPDATE SET price = EXCLUDED.price, category_id = EXCLUDED.category_id;
