"use client";

import React from "react";
import Button from "../ui/Button";

const CreateIssueButton: React.FC = () => {
  const handleClick = () => {
    window.dispatchEvent(new Event("open-create-modal"));
  };

  return (
    <Button type="button" variant="primary" onClick={handleClick}>
      Create
    </Button>
  );
};

export default CreateIssueButton;
