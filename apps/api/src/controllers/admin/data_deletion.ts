import { Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { Logger } from "../../lib/logger";
import { supabase_service } from "../../services/supabase";

export async function dataDeletionJob(req: Request, res: Response) {
  try {
    const currentDate = new Date();
    let { data, error } = await supabase_service
      .from("data_retention")
      .select("id, team_id, days, last_deletion_date");

    if (data) {
      data = data.filter((row) => {
        const lastDeletionDate = row.last_deletion_date
          ? new Date(row.last_deletion_date).getTime()
          : null;
        const daysInterval = row.days * 24 * 60 * 60 * 1000; // Convert days to milliseconds
        return (
          !lastDeletionDate ||
          currentDate.getTime() - lastDeletionDate > daysInterval
        );
      });
    }

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    for (const row of data) {
      const { id, team_id, days } = row;

      const tablesToDeleteFrom = [
        "firecrawl_jobs",
        "proxy_results",
        // TODO: Might need to asscoiate the job_id to the team_id
        "scrape_results",
        // TODO: Might need to asscoiate the job_id to the team_id
        "scrape_events",
      ];

      for (const table of tablesToDeleteFrom) {
        const { data: deletedData, error: deleteError } = await supabase_service
          .from(table)
          .delete()
          .eq("team_id", team_id)
          .select(); // Select the deleted rows for logging

        if (deleteError) {
          return res
            .status(500)
            .json({ success: false, error: deleteError.message });
        }

        Logger.info(`Deleted ${deletedData.length} rows from ${table} for team_id: ${team_id}`);
      }

      const { error: updateError } = await supabase_service
        .from("data_retention")
        .update({ last_deletion_date: new Date().toISOString() })
        .eq("id", id);

      if (updateError) {
        return res
          .status(500)
          .json({ success: false, error: updateError.message });
      }

      Logger.info(`Data deletion performed for team_id: ${team_id}`);
    }

    res
      .status(200)
      .json({ success: true, message: "Data deletion job completed." });
  } catch (error) {
    Logger.error(error);
    res.status(500).json({ success: false, error: error.message });
  }
}
