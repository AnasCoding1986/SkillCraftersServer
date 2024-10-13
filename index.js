const express = require("express");
const cors = require("cors");
const jwt = require('jsonwebtoken');
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express()

const corsOptions = {
  origin: ["http://localhost:5173", "http://localhost:5174", "https://skillcrafters-a05d7.web.app/"],
  credentials: true,
  optionSuccessStatus: 200
}

app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())

// verify jwt middlewire
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ message: "Unauthorized access" });
  if (token) {
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).send({ message: "Unauthorized access" })
      }
      console.log(decoded);
      req.user = decoded;
      next()
    })
  }

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.zdajqzn.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const jobsCollection = client.db("SkillCrafters").collection("jobs");
    const bidsCollection = client.db("SkillCrafters").collection("bids");

    // jwt generate
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d'
      })
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV = "production",
          sameSite: process.env.NODE_ENV = "production" ? "none" : "strict",
        })
        .send({ success: true })
    })

    // clear cookies
    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV = "production",
          sameSite: process.env.NODE_ENV = "production" ? "none" : "strict",
          maxAge: 0
        })
        .send({ success: true })
    })


    // Get All jobs data from db
    app.get("/jobs", async (req, res) => {
      const result = await jobsCollection.find().toArray();

      res.send(result)
    })

    // Get Single jobs data from db
    app.get("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.findOne(query);
      res.send(result)
    })

    // Get all jobs postedby a user
    app.get("/jobs/:email", verifyToken, async (req, res) => {
      const tokenEmail = req.user.email;
      const email = req.params.email;
      if (tokenEmail !== email) {
        return res.status(403).send({ message: "Forbidden access" })
      }
      const query = { "buyer.email": email };
      const result = await jobsCollection.find(query).toArray();
      res.send(result)
    })

    // Save a job data in db
    app.post("/job", async (req, res) => {
      const jobData = req.body;
      const result = await jobsCollection.insertOne(jobData);
      res.send(result)
    })

    // Delete a job
    app.delete("/job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await jobsCollection.deleteOne(query);
      res.send(result)
    })

    // update a job
    app.put("/job/:id", async (req, res) => {
      const id = req.params.id;
      const jobData = req.body;
      const query = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          ...jobData
        }

      }
      const result = await jobsCollection.updateOne(query, updateDoc, options);
      res.send(result)
    })

    // Get all job data in db
    // Get all job data in db
    app.get("/jobs-all", async (req, res) => {
      const limit = parseInt(req.query.limit);
      const cpage = parseInt(req.query.cpage) - 1;
      const filter = req.query.filter;
      const sort = req.query.sort;
      const search = req.query.search;

      let query = {};

      if (search) {
        query.job_title = { $regex: search, $options: "i" }; // Using regex for case-insensitive search
      }

      if (filter) {
        query.category = filter;
      }

      let options = {};
      if (sort) options.sort = { deadline: sort === "asc" ? 1 : -1 };

      const result = await jobsCollection
        .find(query, options)
        .skip(limit * cpage)
        .limit(limit)
        .toArray();

      res.send(result);
    });


    // Get all job count data in db
    app.get("/jobs-count", async (req, res) => {
      const result = await jobsCollection.countDocuments();
      res.send({ result });
    })

    // BidCollection Crud Operations

    // Get bids data from db
    app.get("/my-bids/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })

    // Get bid-request data from db
    app.get("/bid-request/:email", async (req, res) => {
      const email = req.params.email;
      const query = { "buyer.email": email };
      const result = await bidsCollection.find(query).toArray();
      res.send(result)
    })

    // Save a bid data in db
    app.post("/bid", async (req, res) => {
      const bidData = req.body;

      const query = {
        email: bidData.email,
        jobId: bidData.jobId,
      }

      const alreadyExists = await bidsCollection.findOne(query);

      if (alreadyExists) {
        return res
          .status(400)
          .send("You have alredy Placed a bid for this job")
      }

      const result = bidsCollection.insertOne(bidData);
      res.send(result)
    })

    // update bid status
    app.patch("/bid/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: status,
      };
      const result = await bidsCollection.updateOne(query, updatedDoc);
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);



app.get("/", (req, res) => {
  res.send("Hello from SkillCrafters ......")
})

app.listen(port, () => console.log(`Server running on port ${port}`))