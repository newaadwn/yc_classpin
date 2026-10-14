"""Pure partition tests for /question-groups output handling. No model or server needed."""
import unittest
from question_groups import canonical_partition

class PartitionTests(unittest.TestCase):
    def test_strict_output_unchanged(self):
        groups,repaired=canonical_partition([0,0,2,2,4,5],6)
        self.assertEqual(groups,[[0,1],[2,3],[4],[5]]); self.assertEqual(repaired,0)
    def test_member_pointer_is_same_cluster(self):
        # 3 -> 1 while 1 -> 0: the strict rule rejected this; it means {0,1,3}.
        groups,repaired=canonical_partition([0,0,2,1],4)
        self.assertEqual(groups,[[0,1,3],[2]]); self.assertEqual(repaired,1)
    def test_forward_pointer_and_chain(self):
        groups,repaired=canonical_partition([2,3,2,1],4)
        self.assertEqual(groups,[[0,2],[1,3]]); self.assertEqual(repaired,3)
    def test_all_singletons(self):
        groups,repaired=canonical_partition(list(range(5)),5)
        self.assertEqual(groups,[[0],[1],[2],[3],[4]]); self.assertEqual(repaired,0)
    def test_shape_errors_still_fail(self):
        with self.assertRaisesRegex(ValueError,'INVALID_PARTITION len=2 expected=3'):canonical_partition([0,0],3)
        with self.assertRaisesRegex(ValueError,'INVALID_PARTITION'):canonical_partition(None,3)
        with self.assertRaisesRegex(ValueError,'INVALID_ASSIGNMENT index=1 value=3'):canonical_partition([0,3,0],3)
        with self.assertRaisesRegex(ValueError,'INVALID_ASSIGNMENT index=0'):canonical_partition([True,0],2)
        with self.assertRaisesRegex(ValueError,'INVALID_ASSIGNMENT index=2'):canonical_partition([0,0,-1],3)
    def test_every_index_appears_once(self):
        values=[(i*7)%57 for i in range(57)]
        groups,_=canonical_partition(values,57)
        flat=sorted(i for g in groups for i in g)
        self.assertEqual(flat,list(range(57)))

if __name__=='__main__':unittest.main()
