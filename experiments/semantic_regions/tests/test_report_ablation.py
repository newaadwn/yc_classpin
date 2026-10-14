import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from report_ablation import aggregate, inputs_for, validate_result
from report_ablation_leaf import leaf_layout


class AblationTests(unittest.TestCase):
    def setUp(self):
        self.q={"questionAlias":"Q001","question":"어떤 근거인가요?"}
        self.page={"regions":[{"alias":"O1","textRedacted":"page evidence", "readingOrder":1}]}
        self.layout={"regions":[{"alias":"R001","label":"table","textRedacted":"region evidence"}]}
        self.mapping={"mappingStatus":"mapped","regionRefs":[{"regionAlias":"R001","method":"contains"}]}

    def test_controlled_inputs(self):
        _,a,ar=inputs_for('A',self.q,self.page,self.mapping,self.layout)
        _,b,br=inputs_for('B',self.q,self.page,self.mapping,self.layout)
        _,c,cr=inputs_for('C',self.q,self.page,self.mapping,self.layout)
        self.assertEqual(a,['page evidence',''])
        self.assertEqual(b,['','region evidence'])
        self.assertEqual(c,['page evidence','region evidence'])
        self.assertIsNone(ar)
        self.assertEqual(br,cr)

    def test_unmapped_is_not_silently_dropped(self):
        prompt,sources,r=inputs_for('B',self.q,self.page,{"mappingStatus":"unmapped"},self.layout)
        self.assertIn('unmapped',prompt)
        self.assertIsNone(r)
        self.assertEqual(sources,['',''])

    def test_quotation_and_required_evidence(self):
        v={"questionAlias":"Q001","intent":"evidence","connection":"supported",
           "target":"target","analysis":"analysis","action":"action","quote":"invented"}
        self.assertIn('quote-not-in-input',validate_result(v,'Q001',['source']))
        v['quote']=''
        self.assertIn('supported-without-evidence',validate_result(v,'Q001',['source']))
        v['connection']='uncertain'
        self.assertEqual(validate_result(v,'Q001',['source']),[])

    def test_no_cross_page_region_groups(self):
        records=[{"page":p,"regionAlias":"R001","alias":f'Q{p}',"displayable":True,
                  "output":{"intent":"evidence"}} for p in [1,2]]
        self.assertEqual(len(aggregate(records)),2)

    def test_leaf_filter_preserves_original_and_does_not_drop_simple_images(self):
        def region(alias,label,box):
            return {'alias':alias,'label':label,'bboxNorm':dict(zip(('x1','y1','x2','y2'),box)),'textRedacted':''}
        parent=region('R001','image',[0,0,1,1])
        children=[region(f'R{i+2:03}','text',[.1,.1+i*.2,.2,.2+i*.2]) for i in range(3)]
        source={'pages':[{'pageNumber':1,'regions':[parent]+children}]}
        filtered=leaf_layout(source)
        self.assertEqual(len(filtered['pages'][0]['regions']),3)
        self.assertEqual(len(source['pages'][0]['regions']),4)
        self.assertEqual(leaf_layout({'pages':[{'regions':[parent]}]})['pages'][0]['regions'],[parent])


if __name__=='__main__':unittest.main()
