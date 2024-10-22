import { Request, Response } from "express";
import { supabase_service } from "../../../services/supabase";
import { clearACUC } from "../../auth";

export async function acucCacheClearController(req: Request, res: Response) {
    const team_id: string = req.body.team_id;

    const keys = await supabase_service.from("api_keys")
        .select("*")
        .eq("team_id", team_id);
    
    await Promise.all(keys.data.map(x => clearACUC(x.key)));

    res.json({ ok: true });
}
