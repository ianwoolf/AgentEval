import { definePlugin } from "nitro";
import { seedAgentCatalogForExistingProjects } from "../agent-garden/seed-agent-catalog";
import { prisma } from "../db/prisma";

export default definePlugin(() => {
  // SPA shell generation must not connect to or mutate any database.
  if (process.env.TASKLATTICE_PRERENDER === "true") return;
  void seedAgentCatalogForExistingProjects(prisma())
    .then(({ projects, records }) => {
      console.info(
        `Agent Garden catalog is ready for ${projects} Projects (${records} records updated).`,
      );
    })
    .catch((error) => {
      console.error("Agent Garden catalog seeding failed.", error);
    });
});
