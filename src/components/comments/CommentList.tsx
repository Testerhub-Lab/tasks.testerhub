import React from "react";
import Card from "../ui/Card";
import type { Comment } from "@prisma/client";
import { formatDate } from "../issues/utils";

interface CommentListProps {
  comments: Comment[];
}

const CommentList: React.FC<CommentListProps> = ({ comments }) => {
  if (comments.length === 0) {
    return (
      <Card>
        <p className="text-sm text-[var(--color-text-secondary)]">
          No comments yet.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <Card key={comment.id} className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)]">
            <span>{comment.authorName || "Anonymous"}</span>
            <span>{formatDate(comment.createdAt)}</span>
          </div>
          <p className="text-sm text-[var(--color-text)]">{comment.text}</p>
        </Card>
      ))}
    </div>
  );
};

export default CommentList;
