class BaseParser:
    def __init__(self, text: str):
        self.text = text

    def extract_transactions(self):
        raise NotImplementedError
