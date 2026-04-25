"use client";

import { useEffect } from "react";
import { markBacklogSeenAction } from "@/server/actions/users";

const BacklogSeen = () => {
  useEffect(() => {
    markBacklogSeenAction().catch(() => null);
  }, []);

  return null;
};

export default BacklogSeen;
