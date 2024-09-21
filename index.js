import express from 'express';
import bodyParser from 'body-parser';
import Stripe from 'stripe';
import env from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import passport from 'passport';
import { Strategy } from "passport-local";
import session from 'express-session';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import flash from 'connect-flash';
import ejs from 'ejs';

env.config();



const app = express();
const port = 3000;
const saltRounds = 10;
let user=[];
let products=[];
let order=[];
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// Middlewares
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use('/uploads', express.static('uploads'));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
}));
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());


//database
const db=new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
    }
    );
    db.connect();
  
    // Middleware to check authentication
    function ensureAuthenticated(req, res, next) {
      if (req.isAuthenticated()) {
        return next();
      }
      res.redirect('/login');
    }
    

// Set storage engine for multer
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// Initialize upload
const upload = multer({
  storage: storage,
  limits: { fileSize: 1000000 }, // Limit file size to 1MB
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Error: Images only!');
    }
  }
}).single('image'); // 'image' should match your form input name


app.get("/", ensureAuthenticated, async (req, res) =>  {
 
    try {
      const roleResult = await db.query("SELECT user_role FROM users WHERE id=$1", [req.user.id]);
      const role = roleResult.rows[0]?.user_role; 
      console.log(role); // Check the value in the console

      const proResult = await db.query("SELECT * FROM product");
      if (proResult.rows.length > 0) {
        res.render('index.ejs', { product: proResult.rows, role }); // Pass role to the template
      } else {
        res.status(404).send('Products not found');
      }
    } catch (err) {
      console.log(err);
      res.status(500).send('Server error');
    }
  
});

//search result
app.get('/search', async (req, res) => {
  const searchQuery = req.query.query;

  try {
      const result = await db.query('SELECT * FROM product WHERE productname ILIKE $1', [`%${searchQuery}%`]);
      res.json({ products: result.rows });
  } catch (error) {
      console.error('Error fetching search results:', error);
      res.status(500).send('Server Error');
  }
});

 // Login route
 app.get("/login", (req, res) => {
  const messages = req.flash('error');
  res.render("login.ejs", { messages });
});

//register rout
app.get("/register", (req, res) => {
  res.render("register.ejs");
});

 //profile rout
 app.get("/profile", async(req, res) => {
  try{
    const result=await db.query("SELECT * FROM users WHERE id=$1",[req.user.id]);
    const proResult=await db.query("SELECT * FROM product WHERE userid=$1",[req.user.id]);
    if (result.rows.length > 0 || proResult.rows.length>0) {
      res.render('account.ejs', { user: result.rows[0] ,product:proResult.rows });
    } 
    else {
      res.status(404).send('products not found');
    }

  }
  catch(err){
    console.error('Error fetching  details:', err);

    console.log(err);
  }
});


  // Logout route
  app.get("/logout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/login");
    });
  });

  //ptoduct detail
  app.get('/detail/:id', async (req, res) => {
    console.log('Product ID:', req.params.id); // Log the ID
    try {
      const result = await db.query("SELECT * FROM product WHERE id = $1", [req.params.id]);
      if (result.rows.length > 0) {
        console.log('Product Details:', result.rows[0]); // Log the product details
        res.render("productDetail.ejs", { pro: result.rows[0] });
      } else {
        res.status(404).send('Product not found');
      }
    } catch (err) {
      console.error('Error fetching Product details:', err);
      res.status(500).send('Server Error');
    }
  });
  
  //edit product 
  app.get('/editProduct/:id', async(req, res) => {
    console.log('Product ID:', req.params.id); // Log the ID

    try {
      const roleResult = await db.query("SELECT user_role FROM users WHERE id=$1", [req.user.id]);
      const role = roleResult.rows[0]?.user_role; 
      console.log(role); // Check the value in the console
      const result = await db.query("SELECT * FROM product WHERE id = $1", [req.params.id]);
      if (result.rows.length > 0) {
        console.log('Product Details:', result.rows[0]); // Log the product details
        res.render("editProduct.ejs", { pro: result.rows[0],role });
      } else {
        res.status(404).send('Product not found');
      }
    } catch (err) {
      console.error('Error fetching Product details:', err);
      res.status(500).send('Server Error');
    }
  });
 

  //detail
  app.get("/detail", (req, res) => {
    res.render("productDetail.ejs");
  });

app.get("/checkout",async(req,res)=>{
  try {
    // Fetch user role
    const roleResult = await db.query("SELECT user_role FROM users WHERE id=$1", [req.user.id]);
    const role = roleResult.rows[0]?.user_role;

    // Fetch cart items
    const result = await db.query("SELECT * FROM cart WHERE user_id=$1", [req.user.id]);
    const cartItems = result.rows;

    // Calculate total price
    const totalPrice = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);

    // Render the EJS template with role, cart items, and total price
    res.render("checkout.ejs", { role, cart: cartItems, totalPrice });
  } catch (err) {
    console.error('Error fetching details:', err);
    res.status(500).send('Server Error');
  }
});

  //My Products Rout
  app.get("/add-product", async(req, res) => {
    const roleResult = await db.query("SELECT user_role FROM users WHERE id=$1", [req.user.id]);
      const role = roleResult.rows[0]?.user_role; 
      console.log(role); // Check the value in the console
    res.render("addProducts.ejs",{role});
  });
  //cart
  
  app.get("/cart", async (req, res) => {
    try {
      // Fetch user role
      const roleResult = await db.query("SELECT user_role FROM users WHERE id=$1", [req.user.id]);
      const role = roleResult.rows[0]?.user_role;
  
      // Fetch cart items
      const result = await db.query("SELECT * FROM cart WHERE user_id=$1", [req.user.id]);
      const cartItems = result.rows;
  
      // Calculate total price
      const totalPrice = cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  
      // Render the EJS template with role, cart items, and total price
      res.render("cart.ejs", { role, cart: cartItems, totalPrice });
    } catch (err) {
      console.error('Error fetching details:', err);
      res.status(500).send('Server Error');
    }
  });
  //All post requests

  //register
  app.post("/register", async (req, res) => {
    const { name: name,email: email, password: password, role:role } = req.body;
    try {
      const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  
      if (checkResult.rows.length > 0) {
        res.redirect("/login");
      }
       else {
        bcrypt.hash(password, saltRounds, async (err, hash) => {
          if (err) {
            console.error("Error hashing password:", err);
            res.status(500).send("Server error");
          } 
          else {
            const result = await db.query(
              "INSERT INTO users (username, email, password,user_role) VALUES ($1, $2, $3,$4) RETURNING *",
              [name, email, hash,role]
            );
                res.redirect("/");
      
          }
        });
      }
    } catch (err) {
      console.log(err);
      res.status(500).send("Server error");
    }
  });
 //login 
  app.post("/login", passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    failureFlash: true,
  }));
  //profile
  app.post("/editProfile", async(req, res) => {
    const {username:name,email:email}=req.body;
    try{
          await db.query("UPDATE users SET username=$1, email=$2  WHERE id=$3",[name,email,req.user.id]);
          res.redirect("/profile");
    }
    catch(err){
      console.error('Error fetching User details:', err);

      console.log(err);
    }
  });
  
  app.post("/editProduct/:id", upload, async (req, res) => {
    try {
      const { name, price, description } = req.body;
      let imagePath = req.body.existingImage; // Default to the existing image path
  
      if (req.file) {
        imagePath = `/uploads/${req.file.filename}`;
      }
  
      await db.query(
        "UPDATE product SET productname=$1, price=$2, description=$3, image=$4 WHERE id=$5",
        [name, price, description, imagePath, req.params.id]
      );
  
      res.redirect("/profile");
    } catch (err) {
      console.error("Error updating product:", err);
      res.status(500).send("Server Error");
    }
  });
  
  app.post("/deleteProduct/:id", upload, async (req, res) => {
    try {
    
      await db.query(
        "DELETE FROM product  WHERE id=$1",
        [ req.params.id]
      );
  
      res.redirect("/profile");
    } catch (err) {
      console.error("Error deleting product:", err);
      res.status(500).send("Server Error");
    }
  });
  //edit cart

  app.post("/editcart/:id", async(req, res) => {
    const quant=req.body.quant;
    try{
          await db.query("UPDATE cart SET quantity=$1  WHERE id=$2",[quant,req.params.id]);
          res.redirect("/cart");
    }
    catch(err){
      console.error('Error fetching User details:', err);

      console.log(err);
    }
  });;

  app.post("/removeCart/:id", async(req, res) => {
    try{
          await db.query("DELETE FROM cart WHERE id = $1",[req.params.id]);
          res.redirect("/cart");
    }
    catch(err){
      console.error('Error fetching User details:', err);

      console.log(err);
    }
  });;

  // Route to handle add-product
  app.post('/add-product', async(req, res) => {
    upload(req, res, async(err) => {
      if (err) {
        res.status(400).send(err);
      } else {
        if (req.file == undefined) {
          res.status(400).send('No file selected');
        } else {
          // Save the product details and image path to the database
          const { name, price, description } = req.body;
          const image= `/uploads/${req.file.filename}`;  
          await db.query("INSERT INTO product (productname, price, description,image,userid) VALUES ($1, $2, $3 , $4 ,$5)", [name, price, description, image, req.user.id]);
          
          // Only redirect or send a response, not both
          res.redirect("/add-product");
        }
      }
    });
  });
  
  // Route to handle add-product
  app.post('/add-cart/:id', async (req, res) => {
    const checkResult = await db.query("SELECT * FROM cart WHERE pro_id = $1", [req.params.id]);
    if (checkResult.rows.length > 0) {
       // Item already exists
       res.send( 'Item already exists in the cart.');
    }
     else {
      try {
        const product = await db.query("SELECT productname,image, price FROM product WHERE id = $1", [req.params.id]);
        const result = product.rows[0];
          
        if (result) {
            await db.query(
                "INSERT INTO cart (image, price,pro_name, user_id, pro_id) VALUES ($1, $2, $3, $4,$5)", 
                [result.image, result.price,result.productname, req.user.id, req.params.id]
            );
            res.redirect("/cart");
        } else {
            res.status(404).send("Product not found");
        }
    } catch (error) {
        console.error(error);
        res.status(500).send("Server error");
    }
     }
    
});

// Route to handle payment intent creation
// app.post('/create-payment-intent', async (req, res) => {
//     try {
//         const { paymentMethodId } = req.body;

//         const paymentIntent = await stripe.paymentIntents.create({
//             amount: 1000, // Amount in cents
//             currency: 'usd',
//             payment_method: paymentMethodId,
//             confirm: true, // Confirm the payment immediately
//         });

//         res.json({ clientSecret: paymentIntent.client_secret });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });



// order 
  // app.get('/order/:productId', async (req, res) => {
  //   const productId = req.params.productId;
  
  //   try {
  //     // Fetch the product details from the database
  //     const productResult = await db.query('SELECT * FROM products WHERE id = $1', [productId]);
  
  //     if (productResult.rows.length === 0) {
  //       return res.status(404).send('Product not found');
  //     }
  
  //     const product = productResult.rows[0];
  
  //     // Render the order page with the product details
  //     res.render('order.ejs', { product });
  //   } catch (err) {
  //     console.error(err);
  //     res.status(500).send('Server error');
  //   }
  // });
  
  passport.use(
    "local",
    new Strategy(
      {
        usernameField: "email",
        passwordField: "password",
      },
      async function (email, password, cb) {
        try {
          const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
          if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password; //  matches  database schema
            bcrypt.compare(password, storedHashedPassword, (err, valid) => {
              if (err) {
                console.error("Error comparing passwords:", err);
                return cb(err);
              }
              if (valid) {
                return cb(null, user);
              } else {
                return cb(null, false, { message: 'Incorrect password.' });
              }
            });
          } else {
            return cb(null, false, { message: 'User not found.' });
          }
        } catch (err) {
          console.error("Error during authentication:", err);
          return cb(err);
        }
      }
    )
  );
  
  passport.serializeUser((user, cb) => {
    cb(null, user.id);
  });
  
  passport.deserializeUser(async (id, cb) => {
    try {
      const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
      cb(null, result.rows[0]);
    } catch (err) {
      cb(err);
    }
  });
  
  app.listen(port, () => {
    console.log(`Server running on ${port}`);
  });