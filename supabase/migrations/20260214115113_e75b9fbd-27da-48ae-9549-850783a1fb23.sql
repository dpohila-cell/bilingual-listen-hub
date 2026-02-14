CREATE POLICY "Users can update sentences of own books"
ON public.sentences FOR UPDATE
USING (user_owns_book(book_id));

CREATE POLICY "Users can delete sentences of own books"
ON public.sentences FOR DELETE
USING (user_owns_book(book_id));