import { Hono } from "hono"
import contribution from "./contribution"
import github from "./github"

const app: Hono = new Hono().route("/contribution", contribution).route("/github", github)

export default app
