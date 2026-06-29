

import express from "express";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import { verifyWebhook } from "@clerk/backend/webhooks";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

    if (!signingSecret) {
      console.log("❌ CLERK_WEBHOOK_SIGNING_SECRET is missing");

      return res.status(503).json({
        message: "Webhook secret is not provided",
      });
    }

    // Convert Express raw body to a Web Request for Clerk verification
    const payload = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : String(req.body);

    const request = new Request("http://internal/webhooks/clerk", {
      method: "POST",
      headers: new Headers(req.headers),
      body: payload,
    });

    // Verify webhook signature
    const evt = await verifyWebhook(request, {
      signingSecret,
    });

    // console.log("====================================");
    // console.log("✅ Webhook received:", evt.type);
    // console.log("====================================");

    // CREATE / UPDATE USER
    if (evt.type === "user.created" || evt.type === "user.updated") {
      const u = evt.data;

      const email =
        u.email_addresses?.find(
          (e) => e.id === u.primary_email_address_id
        )?.email_address ?? u.email_addresses?.[0]?.email_address;

      const fullName =
        [u.first_name, u.last_name].filter(Boolean).join(" ") ||
        u.username ||
        email?.split("@")[0];

      console.log("Incoming User Data:");
      console.log({
        clerkId: u.id,
        email,
        fullName,
        profilePic: u.image_url,
      });

      try {
        const savedUser = await User.findOneAndUpdate(
          { clerkId: u.id },
          {
            clerkId: u.id,
            email,
            fullName,
            profilePic: u.image_url,
          },
          {
            returnDocument: "after",
            upsert: true,
            setDefaultsOnInsert: true,
          }
        );

        // console.log("✅ User saved successfully");
        // console.log(savedUser);

        // console.log("Current Database:");
        // console.log(mongoose.connection.name);
      } catch (mongoError) {
        console.error("❌ Mongo Save Error");
        console.error(mongoError);
      }
    }

    // DELETE USER
    if (evt.type === "user.deleted") {
      console.log("Deleting user:", evt.data.id);

      if (evt.data.id) {
        await User.findOneAndDelete({
          clerkId: evt.data.id,
        });

        console.log("✅ User deleted");
      }
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("❌ Clerk Webhook Error");
    console.error(error);

    return res.status(400).json({
      message: "Webhook verification failed",
    });
  }
});

export default router;