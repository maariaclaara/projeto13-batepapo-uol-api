axios.defaults.headers.common['Authorization'] = 'JRUmHiiDQqqxD1xHbEzfXJfc';
import axios from "axios";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import Joi from "joi";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { stripHtml } from "string-strip-html";

const app = express();

app.use(express.json()); 
app.use(cors()); 
dotenv.config(); 

const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
  await mongoClient.connect();
  console.log("Connected!");
} catch (error) {
  console.log(error.message);
}
const db = mongoClient.db();


dayjs.extend(utc);
dayjs.extend(timezone);


setInterval(async () => {
  try {
    const timeLimit = dayjs().subtract(10, "seconds").valueOf();
    const deletedParticipants = await db
      .collection("participants")
      .findOneAndDelete({ lastStatus: { $lt: timeLimit } });

    if (deletedParticipants.value) {
      const participantName = deletedParticipants.value.name;
      const message = {
        from: participantName,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().tz("America/Sao_Paulo").format("HH:mm:ss"),
      };

      await db
        .collection("participants")
        .updateOne(
          { name: participantName },
          { $set: { lastStatus: Date.now() } }
        );

      await db.collection("messages").insertOne(message);
    }
  } catch (error) {
    console.error(error.message);
  }
}, 15000);


app.post("/participants", async (req, res) => { 
  
  const name = stripHtml(req.body.name.trim()).result;

  if (!name) {
    return res.status(422).send({ message: "Name is required!" });
  }

  const structure = Joi.object({
    name: Joi.string().trim().min(1).required(),
  });

  const validation = structure.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const error = validation.error.details.map((detail) => detail.message);
    return res.status(422).send(error);
  }

  try {
    const participant = {
      name: name,
      lastStatus: Date.now(),
    };

    const existingParticipant = await db
      .collection("participants")
      .findOne({ name: participant.name });

    if (existingParticipant) {
      return res.status(409).send({ message: "Participant already exists!" });
    }

    await db.collection("participants").insertOne(participant);

    const message = {
      from: participant.name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().tz("America/Sao_Paulo").format("HH:mm:ss"),
    };

    await db.collection("messages").insertOne(message);

    res.status(201).send();
  } catch (error) {
    console.error(error.message);
    res.status(422).send({ message: error.message });
  }
});


app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(participants || []);
  } catch (error) {
    console.error(error.message);
    res.status(500).send({ message: "Error!" });
  }
});


app.post("/messages", async (req, res) => {
  const schema = Joi.object({
    to: Joi.string().trim().min(1).required(),
    text: Joi.string().trim().min(1).required(),
    type: Joi.string().valid("message", "private_message").required(),
  });

  const validation = schema.validate(req.body, { abortEarly: false });

  if (validation.error) {
    const errors = validation.error.details.map((detail) => detail.message);
    return res.status(422).send(errors);
  }

  const from = req.header("User");

  const existingParticipant = await db
    .collection("participants")
    .findOne({ name: from });
  if (!existingParticipant) {
    return res.status(422).send({ message: "Participant does not exist!" });
  }

  const fromSanitized = stripHtml(from.trim()).result;
  const toSanitized = stripHtml(req.body.to.trim()).result;
  const textSanitized = stripHtml(req.body.text.trim()).result;

  const message = {
    from: fromSanitized,
    to: toSanitized,
    text: textSanitized,
    type: req.body.type,
    time: dayjs().tz("America/Sao_Paulo").format("HH:mm:ss"),
  };

  await db.collection("messages").insertOne(message);

  res.status(201).send();
});

app.get("/messages", async (req, res) => {
  const user = req.header("User");

  const limit = parseInt(req.query.limit);

  if (limit < 1 || isNaN(limit)) {
    return res.status(422).send({ message: "Invalid limit value!" });
  }

  try {
    const messages = await db
      .collection("messages")
      .find({
        $or: [
          { to: user },
          { from: user },
          { to: "Todos" },
          { type: "public" },
        ],
      })
      .sort({ $natural: -1 })
      .limit(limit)
      .toArray();

    res.send(messages);
  } catch (error) {
    console.error(error.message);
    res.status(500).send({ message: "Internal Server Error!" });
  }
});


app.post("/status", async (req, res) => {
  const name = req.header("User");

  if (!name) {
    return res.status(404).send();
  }

  const existingParticipant = await db
    .collection("participants")
    .findOne({ name });

  if (!existingParticipant) {
    return res.status(404).send();
  }

  await db
    .collection("participants")
    .updateOne({ name }, { $set: { lastStatus: Date.now() } });

  res.status(200).send();
});


const DOOR = 5000; 
app.listen(DOOR, () => console.log(`Server running on port ${DOOR}`));