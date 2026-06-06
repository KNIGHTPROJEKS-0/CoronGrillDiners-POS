-- Add unique constraint on products name for upsert support
ALTER TABLE products ADD CONSTRAINT products_name_unique UNIQUE (name);

-- Add unique constraint on categories name for upsert support  
ALTER TABLE categories ADD CONSTRAINT categories_name_unique UNIQUE (name);

-- Add available column to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS available BOOLEAN DEFAULT true;
