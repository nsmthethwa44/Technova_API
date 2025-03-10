import express from "express";
import mysql from "mysql";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
dotenv.config(); // Load .env variables

const app = express();
app.use(cookieParser());

app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
    methods: ["POST", "GET", "PUT", "DELETE"],
  })
);

app.use(express.json());
app.use(express.static("public"));

// Configure connection pool
const pool = mysql.createPool({
  connectionLimit: 5, // Adjust the limit as per your needs
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectTimeout: 30000,  // Increase timeout to 30 seconds
  timeout: 30000          // Set connection timeout
});

// Helper function to query using the connection pool
const query = (sql, values = []) =>
  new Promise((resolve, reject) => {
    pool.query(sql, values, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "./public/images");
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "_" + Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
});


// manage products 

// adding new product 
app.post("/newProduct", upload.single("image"), async(req, res) =>{
  const {title, category, price, qty, warrant, description} = req.body;
  const image = req.file?.filename || null;

  try {
    const sql = "INSERT INTO products (`title`, `category`, `price`, `qty`, `warrant`, `description`, `image`) VALUES (?)";
    const values = [title, category, price, qty, warrant, description, image];
    await query(sql, [values]);
    res.json({Status: "success", message: "Product successfully added!"})
  } catch (error) {
    console.log("Failed add new product", error);
    return res.status(500).json({Status: "error", message: "Failed to add new product"})
  }
})

// fetch products 
app.get("/getProducts", async(req, res) =>{
  try {
    const sql = "SELECT * FROM products ORDER BY id DESC";
    const results = await query(sql);
    res.status(200).json({Status: "success", Result: results})
  } catch (error) {
    console.log("Failed to fetch data", error);
    return res.status(501).json({message: "Failed to fetch data"})
  }
})

// get single property details 
app.get("/details/:id", async (req, res) => {
  const id = req.params.id;
  try {
    const sql =  `SELECT * FROM products WHERE id = ?` 
    const results = await query(sql, [id])
    res.json({ Status: "Success", Result: results });
  } catch (error) {
    console.log("Failed to fetch product details", error)
    res.json({ Error: "Get movie error in SQL" });
  }
});

     // fetch wishlist by a specific user
     app.get("/wishlist/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const sql = `
        SELECT p.id, p.title, p.price, p.image, p.category, p.date
         FROM products p
        JOIN wishlist w ON p.id = w.product_id
        WHERE w.user_id = ?;
      `;
      const results = await query(sql, [id])
        res.json({ success: true, Result: results });
      } catch (error) {
        console.error("Error fetching user wishlist:", error);
      }
    });


         // fetch cart by a specific user
         app.get("/cart/:id", async (req, res) => {
          const { id } = req.params;
          try {
            const sql = `
            SELECT p.id, p.title, p.price, p.image, p.category, p.date, c.qty
             FROM products p
            JOIN cart c ON p.id = c.product_id
            WHERE c.user_id = ?;
          `;
          const results = await query(sql, [id])
            res.json({ success: true, Result: results });
          } catch (error) {
            console.error("Error fetching user cart:", error);
          }
        });
// end manage products 

// manage wishlist, cart and orders
// Add to wishlist
app.post('/wishlist', async (req, res) => {
  const { product_id, user_id } = req.body;
  try {
    // Check if the product is already in the wishlist
    const existing = await query(
      "SELECT * FROM wishlist WHERE  product_id = ? AND user_id = ?",
      [product_id, user_id]
    );
    if (existing.length > 0) {
      return res.json({ exists: true });
    }
    // Insert into wishlist
    const sql = "INSERT INTO wishlist (product_id, user_id) VALUES (?, ?)";
    await query(sql, [product_id, user_id]);
    res.json({ success: true });
  } catch (error) {
    console.error("Wishlist Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Add to cart
app.post('/cart', async (req, res) => {
  const { user_id, product_id } = req.body;
  try {
    // Check if product is already in cart
    const existing = await query(
      "SELECT * FROM cart WHERE user_id = ? AND product_id = ?",
      [user_id, product_id]
    );
    if (existing.length > 0) {
      return res.json({ exists: true });
    }
    // Insert into cart
    await query(
      "INSERT INTO cart (user_id, product_id) VALUES (?, ?)",
      [user_id, product_id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Cart Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

  // Fetch count user total likes for a movies
  app.get('/userFavorites/:id', async  (req, res) => {
    const { id: userId } = req.params;
    
    try {
      const sql = `SELECT COUNT(*) AS likes FROM wishlist WHERE user_id = ?`;
      const results =  await query(sql, [userId])
      res.json({ Status: "Success", Result: results });
    } catch (error) {
        console.error("Error getting favorites count:", error);
    }
  });

  // count user cart 
  app.get('/userCartCount/:id', async  (req, res) => {
    const { id: userId } = req.params;
    try {
      const sql = `SELECT COUNT(*) AS cart FROM cart WHERE user_id = ?`;
      const results = await query(sql, [userId]);
      res.json({ Status: "Success", Result: results });
    } catch (error) {
      console.error("Error getting cart count:", error);
    }
  })

  // Clear cart for a specific user
app.delete('/clearCart/:userId', async(req, res) => {
  const {userId } = req.params;
  try {
    // Query to delete all items from the cart for the given user
    const sql = "DELETE FROM cart WHERE user_id = ?";
    const result = await query(sql, [userId]);
    if (result.affectedRows > 0) {
      res.status(200).json({ success: true, message: "Cart cleared successfully" });
    } else {
      res.status(404).json({ success: false, message: "No items found in the cart for this user" });
    }
  } catch (error) {
    console.log("Error clearing cart:", error);
    res.status(500).json({ success: false, message: "Failed to clear the cart" });
  }
});

  // API to delete a wishlist
app.delete("/wishlist/:id/:user_id", async (req, res) => {
  const { id, user_id } = req.params;
  try {
    const sql = "DELETE FROM wishlist WHERE product_id = ? AND user_id = ?";
    const results = await query(sql, [id, user_id])
    if (results.affectedRows > 0) {
      res.json({ success: true, message: "Product successfully removed." });
    } else {
      res.status(404).json({ success: false, message: "Wishlist not found." });
    }
  } catch (error) {
    console.error("Error deleting:", error);
  }
});

// API to delete a cart
app.delete("/cart/:id/:user_id", async (req, res) => {
  const { id, user_id } = req.params;
  try {
    const sql = "DELETE FROM cart WHERE product_id = ? AND user_id = ?";
    const results = await query(sql, [id, user_id])
    if (results.affectedRows > 0) {
      res.json({ success: true, message: "Cake successfully deleted cart." });
    } else {
      res.status(404).json({ success: false, message: "Like not found." });
    }
  } catch (error) {
    console.error("Error deleting cart:", error);
    return res.status(500).json({message: "Failed to clear cart"})
  }
});


  // creating an order 
  app.post("/order", async(req, res) => {
    const orders = req.body; // Array of order data
    const orderId = "nova-" + Math.random().toString(36).substring(2, 9);
    try {
      const values = orders.map((order) => [
        order.product_id,
        order.user_id,
        order.total_price,
        order.qty,
        orderId
      ]);
      const sql = `INSERT INTO orders (product_id, user_id, amount, qty, order_id ) VALUES ? `;
      await query(sql, [values]); // Use bulk insert for efficiency
      res.status(200).json({ Status: "success", message: "Order placed successfully.", orderId });
    } catch (error) {
      console.error("Error inserting orders:", error);
      res.status(500).send({ Error: false, message: "Failed to place the order." });
    }
  });

  // fetch customer order by user ID 
  app.get("/userOrders/:id", async(req, res) =>{
    const {id} = req.params;
    try {
      const sql = `
      SELECT 
          p.id,
          p.title,
          p.image,
          o.qty,
          o.amount
      FROM orders o
      RIGHT JOIN products p ON p.id = o.product_id
      WHERE status ="Pending" AND user_id = ?
      `;
      const results = await query(sql, [id]);
      res.json({Status: "success", Result: results })
    } catch (error) {
      console.log("Failed to fetch customer orders", error);
      return res.status(500).json({Error: "Error", message: "Failed to get customer orders"})
    }
  })

  app.get("/totalAmount/:id", async(req,res) =>{
    const {id} = req.params;
    try {
      const sql = `SELECT SUM(amount) AS total_amount FROM orders WHERE status = "Pending" AND user_id = ?`;
      const results = await query(sql, [id]);
      res.json({Status: "success", Result: results})
    } catch (error) {
      console.log("Failed to fetch customer total amount", error)
      return res.status(500).json({Error: "Error", message: "Failed to get customer total amount"})
    }
  })

  // delete user single order 
  app.delete("/deleteOrder/:id/:user_id", async(req, res) =>{
    const {id, user_id} = req.params;
    try {
      const sql = "DELETE FROM orders WHERE product_id = ? AND user_id = ?";
      const results = await query(sql, [id, user_id])
      if (results.affectedRows > 0) {
        res.json({Status: "success", message: "Order successfully deleted cart." });
      } else {
        res.status(404).json({ success: false, message: "Failed to delete order." });
      }
    } catch (error) {
      console.log("Failed to delete product", error);
      return res.status(500).json({Error: "error", message: "Failed to delete product"})
    }
  })

// process user order 
app.post("/checkout", async (req, res) => {
  const { payment_method, card_number, total_amount, user_id } = req.body;
  const transactionId = "nova-" + Math.random().toString(36).substring(2, 9);
  console.log(payment_method, card_number, total_amount, user_id);
  // Ensure all required fields are present
  if (!payment_method || !card_number || !total_amount || !user_id) {
    return res.status(400).json({ Error: "error", message: "All fields are required" });
  }
  try {
    const sql = `INSERT INTO payment (payment_method, card_number, user_id, total_amount, transaction_id) VALUES (?, ?, ?, ?, ?)`;
    const values = [payment_method, card_number, user_id, total_amount, transactionId];
    await query(sql, values);
    res.json({ Status: "success", transactionId });

  } catch (error) {
    console.error("Failed to process payment", error);
    return res.status(500).json({ Error: "error", message: "Failed to process payment" });
  }
});

 // update orders status 
app.put("/orderStatus/:id", async(req, res) =>{
  const {id} = req.params;
  try {
    const sql = `UPDATE orders SET status = "Paid" WHERE  user_id = ?`;
    await query(sql, [id]);
    res.json({Status: "updated", message: "Order status updated"})
  } catch (error) {
    console.log("Failed to update order status")
    return res.status(500).json({message:"Failed to update order status" })
  }
})

// fetch all orders 
app.get("/allOrders", async(req, res) =>{
  try {
    const sql = `
    SELECT
    o.qty,
    o.order_id,
    o.amount,
    o.status,
    o.date,
    p.image,
    p.title,
    p.price,
    u.photo,
    u.name
    FROM
    orders o
    LEFT JOIN
    products p ON p.id = o.product_id
   LEFT JOIN
   users u ON u.id = o.user_id
    `
    const results = await query(sql);
    res.json({Status: "success", Result: results})
  } catch (error) {
    console.log("Failed to fetch orders", error);
    return res.status(500).json({message: "Failed to fetch orders"})
  }
})

// end manage wishlist, cart, payment and  orders

// manage users 
// register new account 
const saltRounds = 10;
app.post("/register", upload.single("photo"), async(req, res) =>{
  const {name, email, password, role} = req.body;
  const photo = req.file?.filename || null;

  if(!name || !email || !password){
    return res.json({Status: "Error", message: "All fields are required."})
   }

  try {
    const searchSql = "SELECT * FROM users WHERE email = ?";
    const results = await query(searchSql, [email])
    if (results.length > 0) {
      return res.status(409).json({Status: "Exists", message: "User already exists. Please log in."});
    }

  const hashedPassword = await bcrypt.hash(password, saltRounds);
   const values = [name, email, hashedPassword, role, photo];
   const sql = "INSERT INTO users (`name`, `email`, `password`,  `role`, `photo`) VALUES (?)"
   await query(sql, [values]);
   res.json({Status: "success", message: "Account successfully created!"})
  } catch (error) {
    console.log("Failed to register new user account", error)
    return res.status(500).json({ Status: "Error", message: "Failed to register new user account" });
  }
})

// fetch all users 
app.get("/users", async(req, res) =>{
  try {
    const sql ="SELECT * FROM users ORDER BY id DESC";
    const results = await query(sql);
    res.json({Status: "success", Result: results})
  } catch (error) {
    console.log("Failed to fetch users data", error);
    return res.status(500).json({Status: "Error", message: "Failed to fetch users data"})
  }
})

// user login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const sql = "SELECT * FROM users WHERE email = ?";
    const results = await query(sql, [email]);
    if (results.length === 0) {
      return res.status(401).json({ Status: "Error", message: "User not found. Please register." });
    }
    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ Status: "Error", message: "Incorrect password." });
    }
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, photo: user.photo, role: user.role },
      "jwt-secret-key",
      { expiresIn: "1d" }
    );
    res.cookie("token", token);
    res.json({
      Status: "Success",
      message: "Login successful!",
      token,
      user: { id: user.id, name: user.name, email: user.email, photo: user.photo, role: user.role },
    });
  } catch (error) {
    console.error("Error logging in user:", error);
    res.status(500).json({ error: "An error occurred during login." });
  }
});

// protecting routes 
const verifyToken = (req, res, next) =>{
  const token = req.header("Authorization");
  console.log("Extracted Token:", token);

  if(!token){
    console.log("Token Missing");
    return res.status(403).json({error: "User not authenticated!"});
  }
  try {
    const verified = jwt.verify(token.split(" ")[1], "jwt-secret-key");
    req.user = verified;
    req.role = verified.role;
    console.log("Decoded Token:", verified);
    next();
  } catch (error) {
    res.status(400).json({error: "Invalid token"});
  }
}

// routes 
app.get("/admin", verifyToken, (req, res) =>{
  res.json({Status: "success", role: req.role, message: "Protected route accessed", user: req.user})
})
// end manage users 












// port number 
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});