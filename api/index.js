import express from "express";
import { createRequestHandler } from "@react-router/express";

const app = express();
const build = await import("../build/server/index.js");

app.use(express.static("public"));
app.use(express.static("build/client"));
app.all(
  "*",
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV || "production",
  }),
);

export default app;
