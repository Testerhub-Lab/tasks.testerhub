"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Textarea from "../ui/Textarea";
import Input from "../ui/Input";
import Button from "../ui/Button";
import { addCommentAction } from "../../server/actions/tasks";
import { isAuthRequiredError, showAuthRequiredToast } from "@/lib/authRequired";

interface AddCommentFormProps {
  taskId: string;
}

const AddCommentForm: React.FC<AddCommentFormProps> = ({ taskId }) => {
  const router = useRouter();
  const [text, setText] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [isSaving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    try {
      const result = await addCommentAction({
        taskId,
        text,
        authorName: authorName || undefined,
      });
      if (!result.ok) {
        if (isAuthRequiredError({ formError: result.formError ?? null })) {
          showAuthRequiredToast();
          return;
        }
        setErrorMessage(result.formError ?? "Не удалось добавить комментарий.");
        return;
      }
      setText("");
      setAuthorName("");
      router.refresh();
    } catch (error) {
      console.error(error);
      setErrorMessage("Не удалось добавить комментарий.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        name="text"
        placeholder="Добавьте комментарий"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <Input
        type="text"
        name="authorName"
        placeholder="Ваше имя (опционально)"
        value={authorName}
        onChange={(event) => setAuthorName(event.target.value)}
      />
      {errorMessage ? (
        <div className="text-sm text-[var(--color-error)]">{errorMessage}</div>
      ) : null}
      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={isSaving || !text.trim()}>
          {isSaving ? "Saving..." : "Add comment"}
        </Button>
      </div>
    </form>
  );
};

export default AddCommentForm;
