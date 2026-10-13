import unittest
from server import analysis_options, layout_sections, validate_elements, validate_groups


class AnalysisConfigurationTests(unittest.TestCase):
    def test_automatic_ignores_manual_preferences(self):
        result=analysis_options(dict(mode='auto',field=['engineering_it','business'],studentLevel='beginner',purposes=['exam'],granularity='fine'))
        self.assertEqual(result,(6,.035,'normal',{'mode':'auto'}))

    def test_actual_segmentation_parameters(self):
        elements=[dict(id=i,kind='text',text=f'개념 {i}',box=[.05+i*.15,.2,.12+i*.15,.5]) for i in range(6)]
        self.assertEqual(len(layout_sections(elements,{'granularity':'coarse'})),3)
        self.assertEqual(len(layout_sections(elements,{'granularity':'fine'})),6)
        self.assertEqual(analysis_options({'granularity':'fine'})[:2],(10,.015))
        self.assertEqual(analysis_options({'granularity':'normal'})[0],6)

    def test_context_and_validation(self):
        config=dict(granularity='fine',studentLevel='beginner',field='engineering_it',purposes=['concept'],focusElements=['image'],keyConcepts=['Pooling'],customTerms='Agent = LLM Agent')
        context=analysis_options(config)[3]
        self.assertEqual(context['studentLevel'],'beginner')
        self.assertEqual(context['focusElements'],['image'])
        with self.assertRaises(ValueError):analysis_options({'granularity':'bad'})
        with self.assertRaises(ValueError):validate_elements([dict(id=0,kind='text',text='a',box=[0,0,float('nan'),1])])
        with self.assertRaises(ValueError):validate_groups([],[],3)


if __name__=='__main__':unittest.main()
