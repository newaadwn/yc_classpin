import unittest
from server import validate_groups

class ValidationTests(unittest.TestCase):
    def setUp(self):self.elements=[{'box':[.05,.2,.4,.8]},{'box':[.6,.2,.95,.8]}]
    def test_valid(self):
        result=validate_groups([{'name':'문제','meaning':'문제 설명','members':[0]},{'name':'해결','meaning':'해결 설명','members':[1]}],self.elements)
        self.assertEqual(len(result),2)
    def test_duplicate(self):
        with self.assertRaises(ValueError):validate_groups([{'name':'a','meaning':'a','members':[0]},{'name':'b','meaning':'b','members':[0]}],self.elements)
    def test_invalid_id(self):
        with self.assertRaises(ValueError):validate_groups([{'name':'a','meaning':'a','members':[9]}],self.elements)
    def test_overlap(self):
        with self.assertRaises(ValueError):validate_groups([{'name':'a','meaning':'a','members':[0]},{'name':'b','meaning':'b','members':[1]}],[{'box':[0,0,.8,.8]},{'box':[.2,.2,1,1]}])

if __name__=='__main__':unittest.main()
